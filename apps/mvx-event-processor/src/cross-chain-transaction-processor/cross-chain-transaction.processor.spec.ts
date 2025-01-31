import { ApiConfigService } from '@mvx-monorepo/common';
import { createMock, DeepMocked } from '@golevelup/ts-jest';
import { Test } from '@nestjs/testing';
import { AxelarGmpApi } from '@mvx-monorepo/common/api/axelar.gmp.api';
import { ApiNetworkProvider, TransactionEvent, TransactionOnNetwork } from '@multiversx/sdk-network-providers/out';
import { RedisHelper } from '@mvx-monorepo/common/helpers/redis.helper';
import { CrossChainTransactionProcessorService } from './cross-chain-transaction.processor.service';
import { EventIdentifiers, Events } from '@mvx-monorepo/common/utils/event.enum';
import { BinaryUtils } from '@multiversx/sdk-nestjs-common';
import { GasServiceProcessor, GatewayProcessor } from './processors';
import { ItsProcessor } from './processors/its.processor';

const mockTransactionResponse = {
  txHash: '5cc3bf9866b77b6d05b3756a0faff67d7685058579550989f39cb4319bec0fc1',
  gasLimit: 20000000,
  gasPrice: 1000000000,
  gasUsed: 14531829,
  miniBlockHash: 'bc0292fd2b60255604a982bfa5853ecd39fd2aa28b90ba63bbfa9f47071f78b6',
  nonce: 617,
  receiver: 'erd1qqqqqqqqqqqqqpgqcv3rhjjrqpl88es4q25lw03hfhpw6s36kklsn6t9a6',
  receiverShard: 1,
  round: 5556869,
  sender: 'erd1wavgcxq9tfyrw49k3s3h34085mayu82wqvpd4h6akyh8559pkklsknwhwh',
  senderShard: 1,
  signature:
    'e16f49d7fb89cf5b616cfef37f8411ec0e2a31d3f511c497916298cec86a90f500934284de724de68ae4ff08f93b39f96c2868b82bdbbfa835c15327aa56d706',
  status: 'success',
  value: '1000000000000000000',
  fee: '502213290000000',
  timestamp: 1727341214,
  data: 'aW50ZXJjaGFpblRyYW5zZmVyQGE1YzYwZjNiODdmOGJkOWFlNmQ5Nzc1NTE0M2I5ODQyOTAyYjIyOGM0NmJlYjdhYmY2M2YxMmUwOTA0YzE5YjFANjU3NDY4NjU3MjY1NzU2ZDJkMzJAMzA3ODY2MzczODM2NjUzMjMxMzUzMDM5NjEzOTY0MzUzMDYxMzk2MTY2NjQzMDMzMzM2MjM1MzkzNDMwNjEzMjYyMzc2NDM4MzczMjYzMzIzMDM4QEAwMTYzNDU3ODVkOGEwMDAw',
  function: 'interchainTransfer',
  action: { category: 'scCall', name: 'interchainTransfer' },
  type: 'normal',
  results: [
    {
      hash: '54d29b6338ac51c5f9ad406c0cf495e3fa7d6ff97d036ca95bcaa615fe1d04ef',
      timestamp: 1727341214,
      nonce: 618,
      gasLimit: 0,
      gasPrice: 1000000000,
      value: '54681710000000',
      sender: 'erd1qqqqqqqqqqqqqpgqcv3rhjjrqpl88es4q25lw03hfhpw6s36kklsn6t9a6',
      receiver: 'erd1wavgcxq9tfyrw49k3s3h34085mayu82wqvpd4h6akyh8559pkklsknwhwh',
      data: 'QDZmNmI=',
      prevTxHash: '5cc3bf9866b77b6d05b3756a0faff67d7685058579550989f39cb4319bec0fc1',
      originalTxHash: '5cc3bf9866b77b6d05b3756a0faff67d7685058579550989f39cb4319bec0fc1',
      callType: '0',
      miniBlockHash: 'd348c996423abf546cc6a56c85efc9c152b98628016bc27c453ca1da8e05001b',
      function: 'transfer',
    },
  ],
  price: 29.68,
  logs: {
    id: '5cc3bf9866b77b6d05b3756a0faff67d7685058579550989f39cb4319bec0fc1',
    address: 'erd1qqqqqqqqqqqqqpgqcv3rhjjrqpl88es4q25lw03hfhpw6s36kklsn6t9a6',
    events: [],
  },
  operations: [],
};

const mockGatewayContract = 'erd1qqqqqqqqqqqqqpgqvc7gdl0p4s97guh498wgz75k8sav6sjfjlwqh679jy';
const mockGasServiceContract = 'erd1qqqqqqqqqqqqqqqpqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqplllst77y4l';
const mockItsContract = 'erd1qqqqqqqqqqqqqpgqc5ypvy2d6z52fwscsfnrwcdkdh2fnthfkkls7kcn9j';

describe('CrossChainTransactionProcessor', () => {
  let gatewayProcessor: DeepMocked<GatewayProcessor>;
  let gasServiceProcessor: DeepMocked<GasServiceProcessor>;
  let itsProcessor: DeepMocked<ItsProcessor>;
  let axelarGmpApi: DeepMocked<AxelarGmpApi>;
  let redisHelper: DeepMocked<RedisHelper>;
  let api: DeepMocked<ApiNetworkProvider>;
  let apiConfigService: DeepMocked<ApiConfigService>;

  let service: CrossChainTransactionProcessorService;

  beforeEach(async () => {
    gatewayProcessor = createMock();
    gasServiceProcessor = createMock();
    itsProcessor = createMock();
    axelarGmpApi = createMock();
    redisHelper = createMock();
    api = createMock();
    apiConfigService = createMock();

    apiConfigService.getContractGateway.mockReturnValue(mockGatewayContract);
    apiConfigService.getContractGasService.mockReturnValue(mockGasServiceContract);
    apiConfigService.getContractIts.mockReturnValue(mockItsContract);

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

        if (token === ItsProcessor) {
          return itsProcessor;
        }

        if (token === AxelarGmpApi) {
          return axelarGmpApi;
        }

        if (token === RedisHelper) {
          return redisHelper;
        }

        if (token === ApiNetworkProvider) {
          return api;
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

    api.doGetGeneric.mockImplementation((url) => {
      const txHash = url.split('/')[1];

      if (txHash === 'txHashNone') {
        throw new Error('not found');
      }

      const transaction = { ...mockTransactionResponse };
      transaction.txHash = txHash;

      if (txHash === 'txHashPending') {
        transaction.status = 'pending';
      } else if (txHash === 'txHashFailed') {
        transaction.status = 'failed';
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
    const rawGasEvent = {
      address: mockGasServiceContract,
      identifier: 'any',
      data: '',
      topics: [BinaryUtils.base64Encode(Events.GAS_PAID_FOR_CONTRACT_CALL_EVENT)],
    };
    const rawGatewayEvent = {
      address: mockGatewayContract,
      identifier: EventIdentifiers.CALL_CONTRACT,
      data: '',
      topics: [BinaryUtils.base64Encode(Events.CONTRACT_CALL_EVENT)],
    };
    const rawItsEvent = {
      address: mockItsContract,
      identifier: 'any',
      data: '',
      topics: [BinaryUtils.base64Encode(Events.INTERCHAIN_TRANSFER_EVENT)],
    };
    const rawApprovedEvent = {
      address: mockGatewayContract,
      identifier: EventIdentifiers.APPROVE_MESSAGES,
      data: '',
      topics: [BinaryUtils.base64Encode(Events.MESSAGE_APPROVED_EVENT)],
    };

    const transaction = { ...mockTransactionResponse };
    transaction.txHash = 'txHash';
    transaction.status = 'success';
    transaction.fee = '1000';
    transaction.value = '0';

    it('Should handle multiple events', async () => {
      // @ts-ignore
      transaction.logs.events = [rawGasEvent, rawGatewayEvent, rawItsEvent];

      redisHelper.smembers.mockReturnValueOnce(Promise.resolve(['txHash']));
      api.doGetGeneric.mockReturnValueOnce(Promise.resolve(transaction));

      await service.processCrossChainTransactionsRaw();

      expect(gasServiceProcessor.handleGasServiceEvent).toHaveBeenCalledTimes(1);
      expect(gasServiceProcessor.handleGasServiceEvent).toHaveBeenCalledWith(
        TransactionEvent.fromHttpResponse(rawGasEvent),
        TransactionOnNetwork.fromApiHttpResponse(transaction.txHash, transaction),
        0,
        '1000',
      );

      expect(gatewayProcessor.handleGatewayEvent).toHaveBeenCalledTimes(1);
      expect(gatewayProcessor.handleGatewayEvent).toHaveBeenCalledWith(
        TransactionEvent.fromHttpResponse(rawGatewayEvent),
        expect.any(TransactionOnNetwork),
        1,
        '1000',
        '0',
      );

      expect(itsProcessor.handleItsEvent).toHaveBeenCalledTimes(1);
      expect(itsProcessor.handleItsEvent).toHaveBeenCalledWith(
        TransactionEvent.fromHttpResponse(rawItsEvent),
        expect.any(TransactionOnNetwork),
        2,
      );

      expect(axelarGmpApi.postEvents).toHaveBeenCalledTimes(1);
      expect(axelarGmpApi.postEvents).toHaveBeenCalledWith(expect.anything(), 'txHash');
      expect(axelarGmpApi.postEvents.mock.lastCall?.[0]).toHaveLength(3);

      expect(redisHelper.srem).toHaveBeenCalledTimes(1);
      expect(redisHelper.srem).toHaveBeenCalledWith('crossChainTransactions', 'txHash');
    });

    it('Should handle multiple approval events fee', async () => {
      // @ts-ignore
      transaction.logs.events = [rawApprovedEvent, rawApprovedEvent];

      redisHelper.smembers.mockReturnValueOnce(Promise.resolve(['txHash']));
      api.doGetGeneric.mockReturnValueOnce(Promise.resolve(transaction));

      gatewayProcessor.handleGatewayEvent.mockReturnValue(
        Promise.resolve({
          eventID: '0xtxHash-1',
          message: {
            messageID: '',
            payloadHash: '',
            destinationAddress: '',
            sourceAddress: '',
            sourceChain: '',
          },
          cost: {
            amount: '0', // Will be overwritten
          },
          type: 'MESSAGE_APPROVED',
        }),
      );

      await service.processCrossChainTransactionsRaw();

      expect(gatewayProcessor.handleGatewayEvent).toHaveBeenCalledTimes(2);
      expect(gatewayProcessor.handleGatewayEvent).toHaveBeenCalledWith(
        TransactionEvent.fromHttpResponse(rawApprovedEvent),
        expect.any(TransactionOnNetwork),
        1,
        '1000',
        '0'
      );

      expect(axelarGmpApi.postEvents).toHaveBeenCalledTimes(1);
      expect(axelarGmpApi.postEvents).toHaveBeenCalledWith(expect.anything(), 'txHash');
      expect(axelarGmpApi.postEvents.mock.lastCall?.[0]).toHaveLength(2);

      // Assert gas was correctly calculated for each event
      // @ts-ignore
      expect(axelarGmpApi.postEvents.mock.lastCall?.[0][0].cost.amount).toBe('500');
      // @ts-ignore
      expect(axelarGmpApi.postEvents.mock.lastCall?.[0][1].cost.amount).toBe('500');

      expect(redisHelper.srem).toHaveBeenCalledTimes(1);
      expect(redisHelper.srem).toHaveBeenCalledWith('crossChainTransactions', 'txHash');
    });

    it('Should not postEvents if no events to send', async () => {
      transaction.logs.events = [];

      redisHelper.smembers.mockReturnValueOnce(Promise.resolve(['txHash']));
      api.doGetGeneric.mockReturnValueOnce(Promise.resolve(transaction));

      await service.processCrossChainTransactionsRaw();

      expect(gasServiceProcessor.handleGasServiceEvent).not.toHaveBeenCalled();
      expect(gatewayProcessor.handleGatewayEvent).not.toHaveBeenCalled();

      expect(axelarGmpApi.postEvents).not.toHaveBeenCalled();

      expect(redisHelper.srem).toHaveBeenCalledTimes(1);
      expect(redisHelper.srem).toHaveBeenCalledWith('crossChainTransactions', 'txHash');
    });

    it('Should handle postEvents error', async () => {
      // @ts-ignore
      transaction.logs.events = [rawGasEvent];

      redisHelper.smembers.mockReturnValueOnce(Promise.resolve(['txHash']));
      api.doGetGeneric.mockReturnValueOnce(Promise.resolve(transaction));

      axelarGmpApi.postEvents.mockRejectedValueOnce('Network error');

      await service.processCrossChainTransactionsRaw();

      expect(gasServiceProcessor.handleGasServiceEvent).toHaveBeenCalledTimes(1);
      expect(gasServiceProcessor.handleGasServiceEvent).toHaveBeenCalledWith(
        TransactionEvent.fromHttpResponse(rawGasEvent),
        TransactionOnNetwork.fromApiHttpResponse(transaction.txHash, transaction),
        0,
        '1000',
      );

      expect(axelarGmpApi.postEvents).toHaveBeenCalledTimes(1);
      expect(axelarGmpApi.postEvents).toHaveBeenCalledWith(expect.anything(), 'txHash');
      expect(axelarGmpApi.postEvents.mock.lastCall?.[0]).toHaveLength(1);

      expect(redisHelper.srem).not.toHaveBeenCalled();
    });
  });
});
