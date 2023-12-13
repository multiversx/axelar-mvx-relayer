import { Locker } from '@multiversx/sdk-nestjs-common';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { GrpcService } from '@mvx-monorepo/common/grpc/grpc.service';
import { CacheService, RedisCacheService } from '@multiversx/sdk-nestjs-cache';
import { ApiConfigService, CacheInfo } from '@mvx-monorepo/common';
import { Subscription } from 'rxjs';
import { SubscribeToApprovalsResponse } from '@mvx-monorepo/common/grpc/entities/relayer';
import { ProviderKeys } from '@mvx-monorepo/common/utils/provider.enum';
import { UserSigner } from '@multiversx/sdk-wallet/out';
import { TransactionsHelper } from '@mvx-monorepo/common/contracts/transactions.helper';
import { GatewayContract } from '@mvx-monorepo/common/contracts/gateway.contract';
import { PendingTransaction } from './entities/pending-transaction';

const MAX_NUMBER_OF_RETRIES = 3;

@Injectable()
export class ApprovalsProcessorService {
  private readonly logger: Logger;
  private readonly sourceChain: string;

  private chainId: string = '';
  private approvalsSubscription: Subscription | null = null;

  constructor(
    private readonly grpcService: GrpcService,
    private readonly cacheService: CacheService,
    private readonly redisCacheService: RedisCacheService,
    @Inject(ProviderKeys.WALLET_SIGNER) private readonly walletSigner: UserSigner,
    private readonly transactionsHelper: TransactionsHelper,
    private readonly gatewayContract: GatewayContract,
    apiConfigService: ApiConfigService,
  ) {
    this.logger = new Logger(ApprovalsProcessorService.name);
    this.sourceChain = apiConfigService.getSourceChainName();
  }

  @Cron('*/30 * * * * *')
  async handleNewApprovals() {
    await Locker.lock('handleNewApprovals', async () => {
      if (this.approvalsSubscription && !this.approvalsSubscription.closed) {
        this.logger.log('GRPC approvals stream subscription is already running');

        return;
      }

      this.logger.log('Starting GRPC approvals stream subscription');

      this.chainId = await this.transactionsHelper.getChainId();

      const lastProcessedHeight =
        (await this.cacheService.get<number>(CacheInfo.StartProcessHeight().key)) || undefined;

      const observable = this.grpcService.subscribeToApprovals(this.sourceChain, lastProcessedHeight);

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
        next: this.processMessage,
        complete: onComplete,
        error: onError,
      });
    });
  }

  @Cron('*/6 * * * * *')
  async handlePendingTransactions() {
    await Locker.lock('pendingTransactions', async () => {
      const keys = await this.redisCacheService.scan(CacheInfo.PendingTransaction('*').key);
      for (const txHash of keys) {
        const cachedValue = await this.cacheService.getRemote<PendingTransaction>(txHash);

        await this.cacheService.deleteRemote(txHash);

        if (cachedValue === undefined) {
          continue;
        }

        const { executeData, retry } = cachedValue;

        const success = await this.transactionsHelper.awaitComplete(txHash);

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
          await this.cacheService.setRemote<PendingTransaction>(CacheInfo.PendingTransaction(txHash).key, {
            executeData: executeData,
            retry: retry,
          });
        }
      }
    });
  }

  async processMessage(response: SubscribeToApprovalsResponse) {
    this.logger.debug('Received Axelar Approvals response:');
    this.logger.debug(JSON.stringify(response));

    try {
      await this.executeTransaction(response.executeData);
    } catch (e) {
      this.logger.error('Error while processing Axelar Approvals response...');
      this.logger.error(e);

      // Set start process height to current block height
      await this.cacheService.set(
        CacheInfo.StartProcessHeight().key,
        response.blockHeight,
        CacheInfo.StartProcessHeight().ttl,
      );

      // Unsubscribe so processing stops at this event and is retried
      (this.approvalsSubscription as Subscription).unsubscribe();

      return;
    }

    // Set start process height to next block height.
    await this.cacheService.set(
      CacheInfo.StartProcessHeight().key,
      response.blockHeight + 1,
      CacheInfo.StartProcessHeight().ttl,
    );
  }

  private async executeTransaction(executeData: Uint8Array, retry: number = 0) {
    this.logger.debug(`Trying to execute Gateway execute transaction with executeData:`);
    this.logger.debug(executeData);

    // TODO: Check if it is fine to use the same wallet as in the CallContractApprovedProcessor
    // and that no issues happen because of nonce
    const accountNonce = await this.transactionsHelper.getAccountNonce(this.walletSigner.getAddress());

    const transaction = this.gatewayContract.buildExecuteTransaction(
      executeData,
      accountNonce,
      this.chainId,
      this.walletSigner.getAddress(),
    );

    const gas = await this.transactionsHelper.getTransactionGas(transaction, retry);
    transaction.setGasLimit(gas);

    const signature = await this.walletSigner.sign(transaction.serializeForSigning());
    transaction.applySignature(signature);

    const txHash = await this.transactionsHelper.sendTransaction(transaction);

    await this.cacheService.setRemote<PendingTransaction>(CacheInfo.PendingTransaction(txHash).key, {
      executeData: executeData,
      retry: retry + 1,
    });
  }
}
