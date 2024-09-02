import { ApiConfigService } from '@mvx-monorepo/common';
import { createMock, DeepMocked } from '@golevelup/ts-jest';
import { Test } from '@nestjs/testing';
import { Address } from '@multiversx/sdk-core/out';
import { AxelarGmpApi } from '@mvx-monorepo/common/api/axelar.gmp.api';
import { ContractCallEvent } from '@mvx-monorepo/common/contracts/entities/gateway-events';
import {
  ProxyNetworkProvider,
  TransactionEvent,
  TransactionOnNetwork,
  TransactionStatus,
} from '@multiversx/sdk-network-providers/out';
import { RedisHelper } from '@mvx-monorepo/common/helpers/redis.helper';
import { CrossChainTransactionProcessorService } from './cross-chain-transaction.processor.service';
import { NotifierEvent } from '../event-processor/types';
import { EventIdentifiers, Events } from '@mvx-monorepo/common/utils/event.enum';
import { BinaryUtils } from '@multiversx/sdk-nestjs-common';
import { GasServiceProcessor, GatewayProcessor } from './processors';

describe('CrossChainTransactionProcessor', () => {
  let gatewayProcessor: DeepMocked<GatewayProcessor>;
  let gasServiceProcessor: DeepMocked<GasServiceProcessor>;
  let axelarGmpApi: DeepMocked<AxelarGmpApi>;
  let redisHelper: DeepMocked<RedisHelper>;
  let proxy: DeepMocked<ProxyNetworkProvider>;
  let apiConfigService: DeepMocked<ApiConfigService>;

  let service: CrossChainTransactionProcessorService;

  const contractCallEvent: ContractCallEvent = {
    sender: Address.fromBech32('erd1qqqqqqqqqqqqqpgqzqvm5ywqqf524efwrhr039tjs29w0qltkklsa05pk7'),
    destinationChain: 'ethereum',
    destinationAddress: 'destinationAddress',
    payloadHash: 'ebc84cbd75ba5516bf45e7024a9e12bc3c5c880f73e3a5beca7ebba52b2867a7',
    payload: Buffer.from('payload'),
  };

  beforeEach(async () => {
    gatewayProcessor = createMock();
    gasServiceProcessor = createMock();
    axelarGmpApi = createMock();
    redisHelper = createMock();
    proxy = createMock();
    apiConfigService = createMock();

    apiConfigService.getContractGateway.mockReturnValue('mockGatewayAddress');
    apiConfigService.getContractGasService.mockReturnValue('mockGasServiceAddress');

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

  describe('handleContractCallEvent', () => {
    const data = contractCallEvent.payload;

    // @ts-ignore
    const rawEvent: NotifierEvent = {
      txHash: 'txHash',
      address: 'mockGatewayAddress',
      identifier: EventIdentifiers.CALL_CONTRACT,
      data: data.toString('base64'),
      topics: [
        BinaryUtils.base64Encode(Events.CONTRACT_CALL_EVENT),
        Buffer.from((contractCallEvent.sender as Address).hex(), 'hex').toString('base64'),
        BinaryUtils.base64Encode(contractCallEvent.destinationChain),
        BinaryUtils.base64Encode(contractCallEvent.destinationAddress),
        Buffer.from(contractCallEvent.payloadHash, 'hex').toString('base64'),
      ],
    };

    const transaction = createMock<TransactionOnNetwork>();
    transaction.hash = 'txHash';
    transaction.status = new TransactionStatus('success');

    // it('Should handle multiple events', async () => {
    //   transaction.logs.events = [
    //     TransactionEvent.fromHttpResponse(rawEvent),
    //     TransactionEvent.fromHttpResponse(rawEvent),
    //   ];
    //
    //   redisHelper.smembers.mockReturnValueOnce(Promise.resolve(['txHash']));
    //   proxy.getTransaction.mockReturnValueOnce(Promise.resolve(transaction));
    //
    //   await service.processCrossChainTransactionsRaw();
    //
    //   expect(gatewayContract.decodeContractCallEvent).toHaveBeenCalledTimes(2);
    //   expect(gatewayContract.decodeContractCallEvent).toHaveBeenCalledWith(transaction.logs.events[0]);
    //   expect(gatewayContract.decodeContractCallEvent).toHaveBeenCalledWith(transaction.logs.events[1]);
    //   expect(contractCallEventRepository.create).toHaveBeenCalledTimes(2);
    //   expect(contractCallEventRepository.create).toHaveBeenCalledWith({
    //     txHash: 'txHash',
    //     eventIndex: 0,
    //     status: ContractCallEventStatus.PENDING,
    //     sourceAddress: 'erd1qqqqqqqqqqqqqpgqzqvm5ywqqf524efwrhr039tjs29w0qltkklsa05pk7',
    //     sourceChain: 'multiversx',
    //     destinationAddress: 'destinationAddress',
    //     destinationChain: 'ethereum',
    //     payloadHash: 'ebc84cbd75ba5516bf45e7024a9e12bc3c5c880f73e3a5beca7ebba52b2867a7',
    //     payload: Buffer.from('payload'),
    //     retry: 0,
    //   });
    //   expect(contractCallEventRepository.create).toHaveBeenCalledWith({
    //     txHash: 'txHash',
    //     eventIndex: 1,
    //     status: ContractCallEventStatus.PENDING,
    //     sourceAddress: 'erd1qqqqqqqqqqqqqpgqzqvm5ywqqf524efwrhr039tjs29w0qltkklsa05pk7',
    //     sourceChain: 'multiversx',
    //     destinationAddress: 'destinationAddress',
    //     destinationChain: 'ethereum',
    //     payloadHash: 'ebc84cbd75ba5516bf45e7024a9e12bc3c5c880f73e3a5beca7ebba52b2867a7',
    //     payload: Buffer.from('payload'),
    //     retry: 0,
    //   });
    //   expect(axelarGmpApi.getCallEvent).toHaveBeenCalledTimes(2);
    //
    //   expect(redisHelper.srem).toHaveBeenCalledTimes(1);
    //   expect(redisHelper.srem).toHaveBeenCalledWith('crossChainTransactions', 'txHash');
    // });
    //
    // it('Should not handle duplicate in database', async () => {
    //   transaction.logs.events = [TransactionEvent.fromHttpResponse(rawEvent)];
    //
    //   contractCallEventRepository.create.mockReturnValueOnce(Promise.resolve(null));
    //
    //   redisHelper.smembers.mockReturnValueOnce(Promise.resolve(['txHash']));
    //   proxy.getTransaction.mockReturnValueOnce(Promise.resolve(transaction));
    //
    //   await service.processCrossChainTransactionsRaw();
    //
    //   expect(gatewayContract.decodeContractCallEvent).toHaveBeenCalledTimes(1);
    //   expect(gatewayContract.decodeContractCallEvent).toHaveBeenCalledWith(TransactionEvent.fromHttpResponse(rawEvent));
    //   expect(contractCallEventRepository.create).toHaveBeenCalledTimes(1);
    //   expect(axelarGmpApi.getCallEvent).not.toHaveBeenCalled();
    // });
    //
    // it('Should handle error can not save in database', async () => {
    //   transaction.logs.events = [TransactionEvent.fromHttpResponse(rawEvent)];
    //
    //   contractCallEventRepository.create.mockRejectedValue(new Error('Can not save in database'));
    //
    //   redisHelper.smembers.mockReturnValueOnce(Promise.resolve(['txHash']));
    //   proxy.getTransaction.mockReturnValueOnce(Promise.resolve(transaction));
    //
    //   await service.processCrossChainTransactionsRaw();
    //
    //   expect(gatewayContract.decodeContractCallEvent).toHaveBeenCalledTimes(1);
    //   expect(gatewayContract.decodeContractCallEvent).toHaveBeenCalledWith(TransactionEvent.fromHttpResponse(rawEvent));
    //   expect(contractCallEventRepository.create).toHaveBeenCalledTimes(1);
    //   expect(axelarGmpApi.getCallEvent).not.toHaveBeenCalled();
    // });
  });

  describe('handleSignersRotatedEvent', () => {
    const rawEvent: NotifierEvent = {
      txHash: 'txHash',
      address: 'mockGatewayAddress',
      identifier: EventIdentifiers.ROTATE_SIGNERS,
      data: Buffer.from(
        '000000030139472eff6886771a982f3083da5d421f24c29181e63888228dc81ca60d69e100000001018049d639e5a6980d1cd2392abcce41029cda74a1563523a202f09641cc2618f80000000101b2a11555ce521e4944e09ab17549d85b487dcd26c84b5017a39e31a3670889ba00000001010000000103290decd9548b62a8d60345a988386fc84ba6bc95484008f6362f93160ef3e563',
        'hex',
      ).toString('base64'),
      topics: [
        BinaryUtils.base64Encode(Events.SIGNERS_ROTATED_EVENT),
        BinaryUtils.hexToBase64('01'),
        Buffer.from('0c38359b7a35c755573659d797afec315bb0e51374a056745abd9764715a15da', 'hex').toString('base64'),
      ],
    };

    const transaction = createMock<TransactionOnNetwork>();
    transaction.hash = 'txHash';
    transaction.status = new TransactionStatus('success');

    it('Should handle event', async () => {
      transaction.logs.events = [
        TransactionEvent.fromHttpResponse({
          address: 'other',
          identifier: 'other',
          topics: [],
          data: '',
        }),
        TransactionEvent.fromHttpResponse({
          address: 'mockGatewayAddress',
          identifier: 'other',
          topics: [],
          data: '',
        }),
        TransactionEvent.fromHttpResponse(rawEvent),
      ];

      redisHelper.smembers.mockReturnValueOnce(Promise.resolve(['txHash']));
      proxy.getTransaction.mockReturnValueOnce(Promise.resolve(transaction));

      await service.processCrossChainTransactionsRaw();

      // expect(gatewayContract.decodeSignersRotatedEvent).toHaveBeenCalledTimes(1);
      // expect(gatewayContract.decodeSignersRotatedEvent).toHaveBeenCalledWith(transaction.logs.events[2]);
      // expect(axelarGmpApi.verifyVerifierSet).toHaveBeenCalledTimes(1);
      // expect(axelarGmpApi.verifyVerifierSet).toHaveBeenCalledWith(
      //   '0xtxHash-2',
      //   expect.anything(),
      //   expect.anything(),
      //   expect.anything(),
      // );
    });

    // it('Should handle event error', async () => {
    //   transaction.logs.events = [TransactionEvent.fromHttpResponse(rawEvent)];
    //
    //   axelarGmpApi.verifyVerifierSet.mockReturnValueOnce(
    //     Promise.resolve({
    //       published: false,
    //       receiptId: '',
    //     }),
    //   );
    //
    //   redisHelper.smembers.mockReturnValueOnce(Promise.resolve(['txHash']));
    //   proxy.getTransaction.mockReturnValueOnce(Promise.resolve(transaction));
    //
    //   await service.processCrossChainTransactionsRaw();
    //
    //   expect(gatewayContract.decodeSignersRotatedEvent).toHaveBeenCalledTimes(1);
    //   expect(gatewayContract.decodeSignersRotatedEvent).toHaveBeenCalledWith(transaction.logs.events[0]);
    //   expect(axelarGmpApi.verifyVerifierSet).toHaveBeenCalledTimes(1);
    // });
  });
});
