import { CacheInfo, TransactionsHelper } from '@mvx-monorepo/common';
import { createMock, DeepMocked } from '@golevelup/ts-jest';
import { Test } from '@nestjs/testing';
import { AxelarGmpApi } from '@mvx-monorepo/common/api/axelar.gmp.api';
import { GatewayContract } from '@mvx-monorepo/common/contracts/gateway.contract';
import { ApprovalsProcessorService } from './approvals.processor.service';
import { RedisCacheService } from '@multiversx/sdk-nestjs-cache';
import { UserSigner } from '@multiversx/sdk-wallet/out';
import { ProviderKeys } from '@mvx-monorepo/common/utils/provider.enum';
import { UserAddress } from '@multiversx/sdk-wallet/out/userAddress';
import { Transaction } from '@multiversx/sdk-core/out';
import { BinaryUtils } from '@multiversx/sdk-nestjs-common';
import { MessageApprovedRepository } from '@mvx-monorepo/common/database/repository/message-approved.repository';

const mockExternalData = Buffer.from(BinaryUtils.stringToHex('approveMessages@61726731@61726732'), 'hex');

describe('ApprovalsProcessorService', () => {
  let axelarGmpApi: DeepMocked<AxelarGmpApi>;
  let redisCacheService: DeepMocked<RedisCacheService>;
  let walletSigner: DeepMocked<UserSigner>;
  let transactionsHelper: DeepMocked<TransactionsHelper>;
  let gatewayContract: DeepMocked<GatewayContract>;
  let messageApprovedRepository: DeepMocked<MessageApprovedRepository>;

  let service: ApprovalsProcessorService;

  beforeEach(async () => {
    axelarGmpApi = createMock();
    redisCacheService = createMock();
    walletSigner = createMock();
    transactionsHelper = createMock();
    gatewayContract = createMock();
    messageApprovedRepository = createMock();

    const moduleRef = await Test.createTestingModule({
      providers: [ApprovalsProcessorService],
    })
      .useMocker((token) => {
        if (token === AxelarGmpApi) {
          return axelarGmpApi;
        }

        if (token === RedisCacheService) {
          return redisCacheService;
        }

        if (token === ProviderKeys.WALLET_SIGNER) {
          return walletSigner;
        }

        if (token === TransactionsHelper) {
          return transactionsHelper;
        }

        if (token === GatewayContract) {
          return gatewayContract;
        }

        if (token === MessageApprovedRepository) {
          return messageApprovedRepository;
        }

        return null;
      })
      .compile();

    redisCacheService.get.mockImplementation(() => {
      return Promise.resolve(undefined);
    });

    service = moduleRef.get(ApprovalsProcessorService);
  });

  // TODO: Add tests for handleNewTasks
  // describe('handleNewTasks', () => {
  //   it('Should process message', async () => {
  //     const observable = new Subject<SubscribeToApprovalsResponse>();
  //     axelarGmpApi.getTasks.mockReturnValueOnce(observable);
  //
  //     await service.handleNewTasksRaw();
  //
  //     // Calling again won't do anything since subscription is already active
  //     await service.handleNewTasksRaw();
  //
  //     expect(redisCacheService.get).toHaveBeenCalledTimes(1);
  //     expect(axelarGmpApi.getTasks).toHaveBeenCalledTimes(1);
  //     expect(axelarGmpApi.getTasks).toHaveBeenCalledWith('multiversx', undefined);
  //
  //     const userAddress = UserAddress.newFromBech32('erd1qqqqqqqqqqqqqpgqhe8t5jewej70zupmh44jurgn29psua5l2jps3ntjj3');
  //     walletSigner.getAddress.mockReturnValueOnce(userAddress);
  //
  //     const transaction: DeepMocked<Transaction> = createMock();
  //     gatewayContract.buildTransactionExternalFunction.mockReturnValueOnce(transaction);
  //
  //     transactionsHelper.getTransactionGas.mockReturnValueOnce(Promise.resolve(100_000_000));
  //     transactionsHelper.signAndSendTransaction.mockReturnValueOnce(Promise.resolve('txHash'));
  //
  //     // Process a message
  //     const message: SubscribeToApprovalsResponse = {
  //       chain: 'multiversx',
  //       executeData: mockExternalData,
  //       blockHeight: 1,
  //     };
  //     observable.next(message);
  //
  //     // Calling this won't do anything
  //     observable.complete();
  //
  //     // Wait a bit so promises finish executing
  //     await new Promise((resolve) => {
  //       setTimeout(resolve, 500);
  //     });
  //
  //     expect(gatewayContract.buildTransactionExternalFunction).toHaveBeenCalledTimes(1);
  //     expect(gatewayContract.buildTransactionExternalFunction).toHaveBeenCalledWith(
  //       'approveMessages@61726731@61726732',
  //       userAddress,
  //       1,
  //     );
  //     expect(transactionsHelper.getTransactionGas).toHaveBeenCalledTimes(1);
  //     expect(transactionsHelper.getTransactionGas).toHaveBeenCalledWith(transaction, 0);
  //     expect(transaction.setGasLimit).toHaveBeenCalledTimes(1);
  //     expect(transaction.setGasLimit).toHaveBeenCalledWith(100_000_000);
  //     expect(transactionsHelper.signAndSendTransaction).toHaveBeenCalledTimes(1);
  //     expect(transactionsHelper.signAndSendTransaction).toHaveBeenCalledWith(transaction, walletSigner);
  //
  //     expect(redisCacheService.set).toHaveBeenCalledTimes(2);
  //     expect(redisCacheService.set).toHaveBeenCalledWith(
  //       CacheInfo.PendingTransaction('txHash').key,
  //       {
  //         txHash: 'txHash',
  //         externalData: message.executeData,
  //         retry: 1,
  //       },
  //       CacheInfo.PendingTransaction('txHash').ttl,
  //     );
  //
  //     // Saves current block height if no error
  //     expect(redisCacheService.set).toHaveBeenCalledWith(
  //       CacheInfo.LastTaskUUID().key,
  //       message.blockHeight,
  //       CacheInfo.LastTaskUUID().ttl,
  //     );
  //   });
  //
  //   it('Should save previous block height for retrying on error', async () => {
  //     const observable = new Subject<SubscribeToApprovalsResponse>();
  //     axelarGmpApi.getTasks.mockReturnValueOnce(observable);
  //
  //     const userAddress = UserAddress.fromBech32('erd1qqqqqqqqqqqqqpgqhe8t5jewej70zupmh44jurgn29psua5l2jps3ntjj3');
  //     walletSigner.getAddress.mockReturnValueOnce(userAddress);
  //     const transaction: DeepMocked<Transaction> = createMock();
  //     gatewayContract.buildTransactionExternalFunction.mockReturnValueOnce(transaction);
  //     transactionsHelper.getTransactionGas.mockRejectedValueOnce(new Error('Network error'));
  //
  //     await service.handleNewTasksRaw();
  //     // Process a message
  //     const message: SubscribeToApprovalsResponse = {
  //       chain: 'multiversx',
  //       executeData: Uint8Array.of(1, 2, 3, 4),
  //       blockHeight: 1,
  //     };
  //     observable.next(message);
  //
  //     // Wait a bit so promises finish executing
  //     await new Promise((resolve) => {
  //       setTimeout(resolve, 500);
  //     });
  //
  //     expect(transactionsHelper.getTransactionGas).toHaveBeenCalledTimes(1);
  //     expect(transactionsHelper.getTransactionGas).toHaveBeenCalledWith(transaction, 0);
  //
  //     expect(redisCacheService.set).toHaveBeenCalledTimes(1);
  //     expect(redisCacheService.set).toHaveBeenCalledWith(
  //       CacheInfo.LastTaskUUID().key,
  //       message.blockHeight - 1,
  //       CacheInfo.LastTaskUUID().ttl,
  //     );
  //
  //     redisCacheService.get.mockImplementation(() => {
  //       return Promise.resolve(1);
  //     });
  //
  //     const newObservable = new Subject<SubscribeToApprovalsResponse>();
  //     axelarGmpApi.getTasks.mockReturnValueOnce(newObservable);
  //
  //     // Will re-initialize the subscription with same block height
  //     await service.handleNewTasksRaw();
  //
  //     expect(redisCacheService.get).toHaveBeenCalledTimes(2);
  //     expect(axelarGmpApi.getTasks).toHaveBeenCalledTimes(2);
  //     expect(axelarGmpApi.getTasks).toHaveBeenCalledWith('multiversx', 1);
  //   });
  //
  //   it('Should reinitialize subscription on complete or on error', async () => {
  //     const observable = new Subject<SubscribeToApprovalsResponse>();
  //     axelarGmpApi.getTasks.mockReturnValueOnce(observable);
  //
  //     await service.handleNewTasksRaw();
  //
  //     observable.complete();
  //
  //     const newObservable = new Subject<SubscribeToApprovalsResponse>();
  //     axelarGmpApi.getTasks.mockReturnValueOnce(newObservable);
  //
  //     await service.handleNewTasksRaw();
  //
  //     expect(redisCacheService.get).toHaveBeenCalledTimes(2);
  //     expect(axelarGmpApi.getTasks).toHaveBeenCalledTimes(2);
  //
  //     newObservable.error(new Error('Network error'));
  //
  //     const newNewObservable = new Subject<SubscribeToApprovalsResponse>();
  //     axelarGmpApi.getTasks.mockReturnValueOnce(newNewObservable);
  //
  //     await service.handleNewTasksRaw();
  //
  //     expect(redisCacheService.get).toHaveBeenCalledTimes(3);
  //     expect(axelarGmpApi.getTasks).toHaveBeenCalledTimes(3);
  //   });
  // });

  describe('handlePendingTransactions', () => {
    it('Should handle undefined', async () => {
      const key = CacheInfo.PendingTransaction('txHashUndefined').key;

      redisCacheService.scan.mockReturnValueOnce(Promise.resolve([key]));
      redisCacheService.get.mockReturnValueOnce(Promise.resolve(undefined));

      await service.handlePendingTransactionsRaw();

      expect(redisCacheService.scan).toHaveBeenCalledTimes(1);
      expect(redisCacheService.get).toHaveBeenCalledTimes(1);
      expect(redisCacheService.get).toHaveBeenCalledWith(key);
      expect(redisCacheService.delete).toHaveBeenCalledTimes(1);
      expect(redisCacheService.delete).toHaveBeenCalledWith(key);
      expect(transactionsHelper.awaitSuccess).not.toHaveBeenCalled();
    });

    it('Should handle success', async () => {
      const key = CacheInfo.PendingTransaction('txHashComplete').key;

      redisCacheService.scan.mockReturnValueOnce(Promise.resolve([key]));
      redisCacheService.get.mockReturnValueOnce(
        Promise.resolve({
          txHash: 'txHashComplete',
          executeData: mockExternalData,
          retry: 1,
        }),
      );
      transactionsHelper.awaitSuccess.mockReturnValueOnce(Promise.resolve(true));

      await service.handlePendingTransactionsRaw();

      expect(redisCacheService.scan).toHaveBeenCalledTimes(1);
      expect(redisCacheService.get).toHaveBeenCalledTimes(1);
      expect(redisCacheService.get).toHaveBeenCalledWith(key);
      expect(redisCacheService.delete).toHaveBeenCalledTimes(1);
      expect(redisCacheService.delete).toHaveBeenCalledWith(key);
      expect(transactionsHelper.awaitSuccess).toHaveBeenCalledTimes(1);
      expect(transactionsHelper.awaitSuccess).toHaveBeenCalledWith('txHashComplete');
      expect(transactionsHelper.getTransactionGas).not.toHaveBeenCalled();
    });

    it('Should handle retry', async () => {
      const key = CacheInfo.PendingTransaction('txHashComplete').key;
      const externalData = mockExternalData;

      redisCacheService.scan.mockReturnValueOnce(Promise.resolve([key]));
      redisCacheService.get.mockReturnValueOnce(
        Promise.resolve({
          txHash: 'txHashComplete',
          externalData,
          retry: 1,
        }),
      );
      transactionsHelper.awaitSuccess.mockReturnValueOnce(Promise.resolve(false));

      const userAddress = UserAddress.fromBech32('erd1qqqqqqqqqqqqqpgqhe8t5jewej70zupmh44jurgn29psua5l2jps3ntjj3');
      walletSigner.getAddress.mockReturnValueOnce(userAddress);

      const transaction: DeepMocked<Transaction> = createMock();
      gatewayContract.buildTransactionExternalFunction.mockReturnValueOnce(transaction);

      transactionsHelper.getTransactionGas.mockReturnValueOnce(Promise.resolve(100_000_000));
      transactionsHelper.signAndSendTransaction.mockReturnValueOnce(Promise.resolve('txHash'));

      await service.handlePendingTransactionsRaw();

      expect(transactionsHelper.awaitSuccess).toHaveBeenCalledTimes(1);
      expect(transactionsHelper.awaitSuccess).toHaveBeenCalledWith('txHashComplete');

      expect(gatewayContract.buildTransactionExternalFunction).toHaveBeenCalledTimes(1);
      expect(gatewayContract.buildTransactionExternalFunction).toHaveBeenCalledWith(
        BinaryUtils.hexToString(externalData.toString('hex')),
        userAddress,
        1,
      );
      expect(transactionsHelper.getTransactionGas).toHaveBeenCalledTimes(1);
      expect(transactionsHelper.getTransactionGas).toHaveBeenCalledWith(transaction, 1);
      expect(transaction.setGasLimit).toHaveBeenCalledTimes(1);
      expect(transaction.setGasLimit).toHaveBeenCalledWith(100_000_000);
      expect(transactionsHelper.signAndSendTransaction).toHaveBeenCalledTimes(1);
      expect(transactionsHelper.signAndSendTransaction).toHaveBeenCalledWith(transaction, walletSigner);

      expect(redisCacheService.set).toHaveBeenCalledTimes(1);
      expect(redisCacheService.set).toHaveBeenCalledWith(
        CacheInfo.PendingTransaction('txHash').key,
        {
          txHash: 'txHash',
          externalData,
          retry: 2,
        },
        CacheInfo.PendingTransaction('txHash').ttl,
      );
    });

    it('Should not handle final retry', async () => {
      const key = CacheInfo.PendingTransaction('txHashComplete').key;
      const executeData = Uint8Array.of(1, 2, 3, 4);

      redisCacheService.scan.mockReturnValueOnce(Promise.resolve([key]));
      redisCacheService.get.mockReturnValueOnce(
        Promise.resolve({
          txHash: 'txHashComplete',
          executeData,
          retry: 3,
        }),
      );
      transactionsHelper.awaitSuccess.mockReturnValueOnce(Promise.resolve(false));

      await service.handlePendingTransactionsRaw();

      expect(transactionsHelper.awaitSuccess).toHaveBeenCalledTimes(1);
      expect(transactionsHelper.awaitSuccess).toHaveBeenCalledWith('txHashComplete');
      expect(transactionsHelper.getTransactionGas).not.toHaveBeenCalled();
    });

    it('Should handle retry error', async () => {
      const key = CacheInfo.PendingTransaction('txHashComplete').key;
      const externalData = mockExternalData;

      redisCacheService.scan.mockReturnValueOnce(Promise.resolve([key]));
      redisCacheService.get.mockReturnValueOnce(
        Promise.resolve({
          txHash: 'txHashComplete',
          externalData,
          retry: 1,
        }),
      );
      transactionsHelper.awaitSuccess.mockReturnValueOnce(Promise.resolve(false));

      const userAddress = UserAddress.fromBech32('erd1qqqqqqqqqqqqqpgqhe8t5jewej70zupmh44jurgn29psua5l2jps3ntjj3');
      walletSigner.getAddress.mockReturnValueOnce(userAddress);

      const transaction: DeepMocked<Transaction> = createMock();
      gatewayContract.buildTransactionExternalFunction.mockReturnValueOnce(transaction);

      transactionsHelper.getTransactionGas.mockRejectedValueOnce(new Error('Network error'));

      await service.handlePendingTransactionsRaw();

      expect(transactionsHelper.awaitSuccess).toHaveBeenCalledTimes(1);
      expect(transactionsHelper.awaitSuccess).toHaveBeenCalledWith('txHashComplete');

      expect(transactionsHelper.getTransactionGas).toHaveBeenCalledTimes(1);
      expect(transactionsHelper.getTransactionGas).toHaveBeenCalledWith(transaction, 1);
      expect(redisCacheService.set).toHaveBeenCalledTimes(1);
      expect(redisCacheService.set).toHaveBeenCalledWith(
        CacheInfo.PendingTransaction('txHashComplete').key,
        {
          txHash: 'txHashComplete',
          externalData,
          retry: 1,
        },
        CacheInfo.PendingTransaction('txHashComplete').ttl,
      );
    });
  });
});
