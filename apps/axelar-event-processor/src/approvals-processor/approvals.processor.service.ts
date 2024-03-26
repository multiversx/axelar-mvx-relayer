import { Locker } from '@multiversx/sdk-nestjs-common';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { GrpcService } from '@mvx-monorepo/common/grpc/grpc.service';
import { RedisCacheService } from '@multiversx/sdk-nestjs-cache';
import { CacheInfo } from '@mvx-monorepo/common';
import { Subscription } from 'rxjs';
import { SubscribeToApprovalsResponse } from '@mvx-monorepo/common/grpc/entities/amplifier';
import { ProviderKeys } from '@mvx-monorepo/common/utils/provider.enum';
import { UserSigner } from '@multiversx/sdk-wallet/out';
import { TransactionsHelper } from '@mvx-monorepo/common/contracts/transactions.helper';
import { GatewayContract } from '@mvx-monorepo/common/contracts/gateway.contract';
import { PendingTransaction } from './entities/pending-transaction';
import { CONSTANTS } from '@mvx-monorepo/common/utils/constants.enum';

const MAX_NUMBER_OF_RETRIES = 3;

@Injectable()
export class ApprovalsProcessorService {
  private readonly logger: Logger;

  private approvalsSubscription: Subscription | null = null;

  constructor(
    private readonly grpcService: GrpcService,
    private readonly redisCacheService: RedisCacheService,
    @Inject(ProviderKeys.WALLET_SIGNER) private readonly walletSigner: UserSigner,
    private readonly transactionsHelper: TransactionsHelper,
    private readonly gatewayContract: GatewayContract,
  ) {
    this.logger = new Logger(ApprovalsProcessorService.name);
  }

  @Cron('*/30 * * * * *')
  async handleNewApprovals() {
    await Locker.lock('handleNewApprovals', this.handleNewApprovalsRaw.bind(this));
  }

  @Cron('*/6 * * * * *')
  async handlePendingTransactions() {
    await Locker.lock('pendingTransactions', this.handlePendingTransactionsRaw.bind(this));
  }

  async handleNewApprovalsRaw() {
    if (this.approvalsSubscription && !this.approvalsSubscription.closed) {
      this.logger.log('GRPC approvals stream subscription is already running');

      return;
    }

    this.logger.log('Starting GRPC approvals stream subscription');

    const lastProcessedHeight =
      (await this.redisCacheService.get<number>(CacheInfo.StartProcessHeight().key)) || undefined;

    const observable = this.grpcService.subscribeToApprovals(CONSTANTS.SOURCE_CHAIN_NAME, lastProcessedHeight);

    const onComplete = () => {
      this.logger.warn('Approvals stream subscription ended');

      this.approvalsSubscription = null;
    };
    const onError = (e: any) => {
      this.logger.error(`Approvals stream subscription ended with error...`);
      this.logger.error(e);

      this.approvalsSubscription = null;
    };

    // TODO: Test if this works as expected
    this.approvalsSubscription = observable.subscribe({
      next: this.processMessage.bind(this),
      complete: onComplete,
      error: onError,
    });
  }

  async handlePendingTransactionsRaw() {
    const keys = await this.redisCacheService.scan(CacheInfo.PendingTransaction('*').key);
    for (const key of keys) {
      const cachedValue = await this.redisCacheService.get<PendingTransaction>(key);

      await this.redisCacheService.delete(key);

      if (cachedValue === undefined) {
        continue;
      }

      const { txHash, executeData, retry } = cachedValue;

      const success = await this.transactionsHelper.awaitSuccess(txHash);

      // Nothing to do on success
      if (success) {
        continue;
      }

      if (retry === MAX_NUMBER_OF_RETRIES) {
        this.logger.error(`Could not execute Gateway execute transaction with hash ${txHash} after ${retry} retries`);

        continue;
      }

      try {
        await this.executeTransaction(executeData, retry);
      } catch (e) {
        this.logger.error('Error while trying to retry Axelar Approvals response transaction...');
        this.logger.error(e);

        // Set value back in cache to be retried again (with same retry number)
        await this.redisCacheService.set<PendingTransaction>(
          CacheInfo.PendingTransaction(txHash).key,
          {
            txHash,
            executeData: executeData,
            retry: retry,
          },
          CacheInfo.PendingTransaction(txHash).ttl,
        );
      }
    }
  }

  private async processMessage(response: SubscribeToApprovalsResponse) {
    this.logger.debug('Received Axelar Approvals response:');
    this.logger.debug(JSON.stringify(response));

    try {
      await this.executeTransaction(response.executeData);
    } catch (e) {
      this.logger.error('Error while processing Axelar Approvals response...');
      this.logger.error(e);

      // Unsubscribe so processing stops at this event and is retried
      this.approvalsSubscription?.unsubscribe();
    } finally {
      // Set start process height to this block height to not lose any progress in case of unexpected issues
      // It is safe to retry Gateway execute transaction that were already executed since the contract supports this
      await this.redisCacheService.set(
        CacheInfo.StartProcessHeight().key,
        response.blockHeight,
        CacheInfo.StartProcessHeight().ttl,
      );
    }
  }

  private async executeTransaction(executeData: Uint8Array, retry: number = 0) {
    this.logger.debug(`Trying to execute Gateway execute transaction with executeData:`);
    this.logger.debug(executeData);

    const transaction = this.gatewayContract.buildExecuteTransaction(executeData, this.walletSigner.getAddress());

    const gas = await this.transactionsHelper.getTransactionGas(transaction, retry);
    transaction.setGasLimit(gas);

    const txHash = await this.transactionsHelper.signAndSendTransaction(transaction, this.walletSigner);

    await this.redisCacheService.set<PendingTransaction>(
      CacheInfo.PendingTransaction(txHash).key,
      {
        txHash,
        executeData: executeData,
        retry: retry + 1,
      },
      CacheInfo.PendingTransaction(txHash).ttl,
    );
  }
}
