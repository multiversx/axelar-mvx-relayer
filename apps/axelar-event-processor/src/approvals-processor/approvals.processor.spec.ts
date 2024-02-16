import { ApiConfigService, CacheInfo, TransactionsHelper } from '@mvx-monorepo/common';
import { createMock, DeepMocked } from '@golevelup/ts-jest';
import { Test } from '@nestjs/testing';
import { GrpcService } from '@mvx-monorepo/common/grpc/grpc.service';
import { GatewayContract } from '@mvx-monorepo/common/contracts/gateway.contract';
import { ApprovalsProcessorService } from './approvals.processor.service';
import { RedisCacheService } from '@multiversx/sdk-nestjs-cache';
import { UserSigner } from '@multiversx/sdk-wallet/out';
import { ProviderKeys } from '@mvx-monorepo/common/utils/provider.enum';
import { Subject } from 'rxjs';
import { SubscribeToApprovalsResponse } from '@mvx-monorepo/common/grpc/entities/relayer';
import { UserAddress } from '@multiversx/sdk-wallet/out/userAddress';
import { Transaction } from '@multiversx/sdk-core/out';

describe('ApprovalsProcessorService', () => {
  let grpcService: DeepMocked<GrpcService>;
  let redisCacheService: DeepMocked<RedisCacheService>;
  let walletSigner: DeepMocked<UserSigner>;
  let transactionsHelper: DeepMocked<TransactionsHelper>;
  let gatewayContract: DeepMocked<GatewayContract>;
  let apiConfigService: DeepMocked<ApiConfigService>;

  let service: ApprovalsProcessorService;

  beforeEach(async () => {
    grpcService = createMock();
    redisCacheService = createMock();
    walletSigner = createMock();
    transactionsHelper = createMock();
    gatewayContract = createMock();
    apiConfigService = createMock();

    apiConfigService.getSourceChainName.mockReturnValue('multiversx-test');

    const moduleRef = await Test.createTestingModule({
      providers: [ApprovalsProcessorService],
    })
      .useMocker((token) => {
        if (token === GrpcService) {
          return grpcService;
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

        if (token === ApiConfigService) {
          return apiConfigService;
        }

        return null;
      })
      .compile();

    apiConfigService.getSourceChainName.mockReturnValueOnce('multiversx-test');
    apiConfigService.getChainId.mockReturnValue('test');
    redisCacheService.get.mockImplementation(() => {
      return Promise.resolve(undefined);
    });

    service = moduleRef.get(ApprovalsProcessorService);
  });

  describe('handleNewApprovals', () => {
    it('Should process message', async () => {
      const observable = new Subject<SubscribeToApprovalsResponse>();
      grpcService.subscribeToApprovals.mockReturnValueOnce(observable);

      await service.handleNewApprovalsRaw();

      // Calling again won't do anything since subscription is already active
      await service.handleNewApprovalsRaw();

      expect(redisCacheService.get).toHaveBeenCalledTimes(1);
      expect(grpcService.subscribeToApprovals).toHaveBeenCalledTimes(1);
      expect(grpcService.subscribeToApprovals).toHaveBeenCalledWith('multiversx-test', undefined);

      const userAddress = UserAddress.fromBech32('erd1qqqqqqqqqqqqqpgqhe8t5jewej70zupmh44jurgn29psua5l2jps3ntjj3');
      walletSigner.getAddress.mockReturnValueOnce(userAddress);

      const transaction: DeepMocked<Transaction> = createMock();
      gatewayContract.buildExecuteTransaction.mockReturnValueOnce(transaction);

      transactionsHelper.getTransactionGas.mockReturnValueOnce(Promise.resolve(100_000_000));
      transactionsHelper.signAndSendTransaction.mockReturnValueOnce(Promise.resolve('txHash'));

      // Process a message
      const message: SubscribeToApprovalsResponse = {
        chain: 'multiversx-test',
        executeData: Uint8Array.of(1, 2, 3, 4),
        blockHeight: 1,
      };
      observable.next(message);

      // Calling this won't do anything
      observable.complete();

      // Wait a bit so promises finish executing
      await new Promise((resolve) => {
        setTimeout(resolve, 500);
      });

      expect(gatewayContract.buildExecuteTransaction).toHaveBeenCalledTimes(1);
      expect(gatewayContract.buildExecuteTransaction).toHaveBeenCalledWith(message.executeData, userAddress);
      expect(transactionsHelper.getTransactionGas).toHaveBeenCalledTimes(1);
      expect(transactionsHelper.getTransactionGas).toHaveBeenCalledWith(transaction, 0);
      expect(transaction.setGasLimit).toHaveBeenCalledTimes(1);
      expect(transaction.setGasLimit).toHaveBeenCalledWith(100_000_000);
      expect(transactionsHelper.signAndSendTransaction).toHaveBeenCalledTimes(1);
      expect(transactionsHelper.signAndSendTransaction).toHaveBeenCalledWith(transaction, walletSigner);

      expect(redisCacheService.set).toHaveBeenCalledTimes(2);
      expect(redisCacheService.set).toHaveBeenCalledWith(
        CacheInfo.PendingTransaction('txHash').key,
        {
          txHash: 'txHash',
          executeData: message.executeData,
          retry: 1,
        },
        CacheInfo.PendingTransaction('txHash').ttl,
      );

      expect(redisCacheService.set).toHaveBeenCalledWith(
        CacheInfo.StartProcessHeight().key,
        message.blockHeight + 1, // next block height
        CacheInfo.StartProcessHeight().ttl,
      );
    });

    it('Should save current block height for retrying on error', async () => {
      const observable = new Subject<SubscribeToApprovalsResponse>();
      grpcService.subscribeToApprovals.mockReturnValueOnce(observable);

      const userAddress = UserAddress.fromBech32('erd1qqqqqqqqqqqqqpgqhe8t5jewej70zupmh44jurgn29psua5l2jps3ntjj3');
      walletSigner.getAddress.mockReturnValueOnce(userAddress);
      const transaction: DeepMocked<Transaction> = createMock();
      gatewayContract.buildExecuteTransaction.mockReturnValueOnce(transaction);
      transactionsHelper.getTransactionGas.mockRejectedValueOnce(new Error('Network error'));

      await service.handleNewApprovalsRaw();
      // Process a message
      const message: SubscribeToApprovalsResponse = {
        chain: 'multiversx-test',
        executeData: Uint8Array.of(1, 2, 3, 4),
        blockHeight: 1,
      };
      observable.next(message);

      // Wait a bit so promises finish executing
      await new Promise((resolve) => {
        setTimeout(resolve, 500);
      });

      expect(transactionsHelper.getTransactionGas).toHaveBeenCalledTimes(1);
      expect(transactionsHelper.getTransactionGas).toHaveBeenCalledWith(transaction, 0);

      expect(redisCacheService.set).toHaveBeenCalledTimes(1);
      expect(redisCacheService.set).toHaveBeenCalledWith(
        CacheInfo.StartProcessHeight().key,
        message.blockHeight, // same block height
        CacheInfo.StartProcessHeight().ttl,
      );

      redisCacheService.get.mockImplementation(() => {
        return Promise.resolve(1);
      });

      const newObservable = new Subject<SubscribeToApprovalsResponse>();
      grpcService.subscribeToApprovals.mockReturnValueOnce(newObservable);

      // Will re-initialize the subscription with same block height
      await service.handleNewApprovalsRaw();

      expect(redisCacheService.get).toHaveBeenCalledTimes(2);
      expect(grpcService.subscribeToApprovals).toHaveBeenCalledTimes(2);
      expect(grpcService.subscribeToApprovals).toHaveBeenCalledWith('multiversx-test', 1);
    });

    it('Should reinitialize subscription on complete or on error', async () => {
      const observable = new Subject<SubscribeToApprovalsResponse>();
      grpcService.subscribeToApprovals.mockReturnValueOnce(observable);

      await service.handleNewApprovalsRaw();

      observable.complete();

      const newObservable = new Subject<SubscribeToApprovalsResponse>();
      grpcService.subscribeToApprovals.mockReturnValueOnce(newObservable);

      await service.handleNewApprovalsRaw();

      expect(redisCacheService.get).toHaveBeenCalledTimes(2);
      expect(grpcService.subscribeToApprovals).toHaveBeenCalledTimes(2);

      newObservable.error(new Error('Network error'));

      const newNewObservable = new Subject<SubscribeToApprovalsResponse>();
      grpcService.subscribeToApprovals.mockReturnValueOnce(newNewObservable);

      await service.handleNewApprovalsRaw();

      expect(redisCacheService.get).toHaveBeenCalledTimes(3);
      expect(grpcService.subscribeToApprovals).toHaveBeenCalledTimes(3);
    });
  });

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
          executeData: Uint8Array.of(1, 2, 3, 4),
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
      const executeData = Uint8Array.of(1, 2, 3, 4);

      redisCacheService.scan.mockReturnValueOnce(Promise.resolve([key]));
      redisCacheService.get.mockReturnValueOnce(
        Promise.resolve({
          txHash: 'txHashComplete',
          executeData,
          retry: 1,
        }),
      );
      transactionsHelper.awaitSuccess.mockReturnValueOnce(Promise.resolve(false));

      const userAddress = UserAddress.fromBech32('erd1qqqqqqqqqqqqqpgqhe8t5jewej70zupmh44jurgn29psua5l2jps3ntjj3');
      walletSigner.getAddress.mockReturnValueOnce(userAddress);

      const transaction: DeepMocked<Transaction> = createMock();
      gatewayContract.buildExecuteTransaction.mockReturnValueOnce(transaction);

      transactionsHelper.getTransactionGas.mockReturnValueOnce(Promise.resolve(100_000_000));
      transactionsHelper.signAndSendTransaction.mockReturnValueOnce(Promise.resolve('txHash'));

      await service.handlePendingTransactionsRaw();

      expect(transactionsHelper.awaitSuccess).toHaveBeenCalledTimes(1);
      expect(transactionsHelper.awaitSuccess).toHaveBeenCalledWith('txHashComplete');

      expect(gatewayContract.buildExecuteTransaction).toHaveBeenCalledTimes(1);
      expect(gatewayContract.buildExecuteTransaction).toHaveBeenCalledWith(
        executeData,
        userAddress,
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
          executeData,
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
      const executeData = Uint8Array.of(1, 2, 3, 4);

      redisCacheService.scan.mockReturnValueOnce(Promise.resolve([key]));
      redisCacheService.get.mockReturnValueOnce(
        Promise.resolve({
          txHash: 'txHashComplete',
          executeData,
          retry: 1,
        }),
      );
      transactionsHelper.awaitSuccess.mockReturnValueOnce(Promise.resolve(false));

      const userAddress = UserAddress.fromBech32('erd1qqqqqqqqqqqqqpgqhe8t5jewej70zupmh44jurgn29psua5l2jps3ntjj3');
      walletSigner.getAddress.mockReturnValueOnce(userAddress);

      const transaction: DeepMocked<Transaction> = createMock();
      gatewayContract.buildExecuteTransaction.mockReturnValueOnce(transaction);

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
          executeData,
          retry: 1,
        },
        CacheInfo.PendingTransaction('txHashComplete').ttl,
      );
    });
  });
});
