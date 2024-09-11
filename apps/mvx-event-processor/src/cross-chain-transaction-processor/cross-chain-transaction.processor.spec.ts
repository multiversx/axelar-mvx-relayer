import { ApiConfigService } from '@mvx-monorepo/common';
import { createMock, DeepMocked } from '@golevelup/ts-jest';
import { Test } from '@nestjs/testing';
import { AxelarGmpApi } from '@mvx-monorepo/common/api/axelar.gmp.api';
import {
  ProxyNetworkProvider,
  TransactionEvent,
  TransactionOnNetwork,
  TransactionStatus,
} from '@multiversx/sdk-network-providers/out';
import { RedisHelper } from '@mvx-monorepo/common/helpers/redis.helper';
import { CrossChainTransactionProcessorService } from './cross-chain-transaction.processor.service';
import { EventIdentifiers, Events } from '@mvx-monorepo/common/utils/event.enum';
import { BinaryUtils } from '@multiversx/sdk-nestjs-common';
import { GasServiceProcessor, GatewayProcessor } from './processors';

const mockGatewayContract = 'erd1qqqqqqqqqqqqqpgqvc7gdl0p4s97guh498wgz75k8sav6sjfjlwqh679jy';
const mockGasServiceContract = 'erd1qqqqqqqqqqqqqqqpqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqplllst77y4l';

describe('CrossChainTransactionProcessor', () => {
  let gatewayProcessor: DeepMocked<GatewayProcessor>;
  let gasServiceProcessor: DeepMocked<GasServiceProcessor>;
  let axelarGmpApi: DeepMocked<AxelarGmpApi>;
  let redisHelper: DeepMocked<RedisHelper>;
  let proxy: DeepMocked<ProxyNetworkProvider>;
  let apiConfigService: DeepMocked<ApiConfigService>;

  let service: CrossChainTransactionProcessorService;

  beforeEach(async () => {
    gatewayProcessor = createMock();
    gasServiceProcessor = createMock();
    axelarGmpApi = createMock();
    redisHelper = createMock();
    proxy = createMock();
    apiConfigService = createMock();

    apiConfigService.getContractGateway.mockReturnValue(mockGatewayContract);
    apiConfigService.getContractGasService.mockReturnValue(mockGasServiceContract);

    const moduleRef = await Test.createTestingModule({
      providers: [CrossChainTransactionProcessorService],
    })
      .useMocker((token) => {
        if (token === GatewayProcessor) {
          return gatewayProcessor;
        }

        if (token === GasServiceProcessor) {
          return gasServiceProcessor;
        }

        if (token === AxelarGmpApi) {
          return axelarGmpApi;
        }

        if (token === RedisHelper) {
          return redisHelper;
        }

        if (token === ProxyNetworkProvider) {
          return proxy;
        }

        if (token === ApiConfigService) {
          return apiConfigService;
        }

        return null;
      })
      .compile();

    service = moduleRef.get(CrossChainTransactionProcessorService);
  });

  it('Should not process pending or failed transaction', async () => {
    redisHelper.smembers.mockReturnValueOnce(Promise.resolve(['txHashNone', 'txHashPending', 'txHashFailed']));

    proxy.getTransaction.mockImplementation((txHash) => {
      if (txHash === 'txHashNone') {
        throw new Error('not found');
      }

      const transaction = createMock<TransactionOnNetwork>();
      transaction.hash = txHash;

      if (txHash === 'txHashPending') {
        transaction.status = new TransactionStatus('pending');
      } else if (txHash === 'txHashFailed') {
        transaction.status = new TransactionStatus('failed');
      }

      return Promise.resolve(transaction);
    });

    await service.processCrossChainTransactionsRaw();

    expect(redisHelper.srem).toHaveBeenCalledTimes(1);
    expect(redisHelper.srem).toHaveBeenCalledWith('crossChainTransactions', 'txHashFailed');
    expect(gatewayProcessor.handleGatewayEvent).not.toHaveBeenCalled();
    expect(gasServiceProcessor.handleGasServiceEvent).not.toHaveBeenCalled();
  });

  describe('processCrossChainTransactions', () => {
    const rawGasEvent: TransactionEvent = TransactionEvent.fromHttpResponse({
      address: mockGasServiceContract,
      identifier: 'any',
      data: '',
      topics: [BinaryUtils.base64Encode(Events.GAS_PAID_FOR_CONTRACT_CALL_EVENT)],
    });
    const rawGatewayEvent: TransactionEvent = TransactionEvent.fromHttpResponse({
      address: mockGatewayContract,
      identifier: EventIdentifiers.CALL_CONTRACT,
      data: '',
      topics: [BinaryUtils.base64Encode(Events.CONTRACT_CALL_EVENT)],
    });

    const transaction = createMock<TransactionOnNetwork>();
    transaction.hash = 'txHash';
    transaction.status = new TransactionStatus('success');

    it('Should handle multiple events', async () => {
      transaction.logs.events = [rawGasEvent, rawGatewayEvent];

      redisHelper.smembers.mockReturnValueOnce(Promise.resolve(['txHash']));
      proxy.getTransaction.mockReturnValueOnce(Promise.resolve(transaction));

      await service.processCrossChainTransactionsRaw();

      expect(gasServiceProcessor.handleGasServiceEvent).toHaveBeenCalledTimes(1);
      expect(gasServiceProcessor.handleGasServiceEvent).toHaveBeenCalledWith(rawGasEvent, transaction, 0);

      expect(gatewayProcessor.handleGatewayEvent).toHaveBeenCalledTimes(1);
      expect(gatewayProcessor.handleGatewayEvent).toHaveBeenCalledWith(rawGatewayEvent, transaction, 1);

      expect(axelarGmpApi.postEvents).toHaveBeenCalledTimes(1);
      expect(axelarGmpApi.postEvents).toHaveBeenCalledWith(expect.anything(), 'txHash');
      expect(axelarGmpApi.postEvents.mock.lastCall?.[0]).toHaveLength(2);

      expect(redisHelper.srem).toHaveBeenCalledTimes(1);
      expect(redisHelper.srem).toHaveBeenCalledWith('crossChainTransactions', 'txHash');
    });

    it('Should not postEvents if no events to send', async () => {
      transaction.logs.events = [];

      redisHelper.smembers.mockReturnValueOnce(Promise.resolve(['txHash']));
      proxy.getTransaction.mockReturnValueOnce(Promise.resolve(transaction));

      await service.processCrossChainTransactionsRaw();

      expect(gasServiceProcessor.handleGasServiceEvent).not.toHaveBeenCalled();
      expect(gatewayProcessor.handleGatewayEvent).not.toHaveBeenCalled();

      expect(axelarGmpApi.postEvents).not.toHaveBeenCalled();

      expect(redisHelper.srem).toHaveBeenCalledTimes(1);
      expect(redisHelper.srem).toHaveBeenCalledWith('crossChainTransactions', 'txHash');
    });

    it('Should handle postEvents error', async () => {
      transaction.logs.events = [rawGasEvent];

      redisHelper.smembers.mockReturnValueOnce(Promise.resolve(['txHash']));
      proxy.getTransaction.mockReturnValueOnce(Promise.resolve(transaction));

      axelarGmpApi.postEvents.mockRejectedValueOnce('Network error');

      await service.processCrossChainTransactionsRaw();

      expect(gasServiceProcessor.handleGasServiceEvent).toHaveBeenCalledTimes(1);
      expect(gasServiceProcessor.handleGasServiceEvent).toHaveBeenCalledWith(rawGasEvent, transaction, 0);

      expect(axelarGmpApi.postEvents).toHaveBeenCalledTimes(1);
      expect(axelarGmpApi.postEvents).toHaveBeenCalledWith(expect.anything(), 'txHash');
      expect(axelarGmpApi.postEvents.mock.lastCall?.[0]).toHaveLength(1);

      expect(redisHelper.srem).not.toHaveBeenCalled();
    });
  });
});
