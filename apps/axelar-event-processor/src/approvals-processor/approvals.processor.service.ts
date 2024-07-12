import { BinaryUtils, Locker } from '@multiversx/sdk-nestjs-common';
import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
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
export class ApprovalsProcessorService implements OnModuleInit {
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

  async onModuleInit() {
    await this.handleNewApprovalsRaw();
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
      this.logger.debug('GRPC approvals stream subscription is already running');

      return;
    }

    const startProcessHeight =
      (await this.redisCacheService.get<number>(CacheInfo.StartProcessHeight().key)) || undefined;

    this.logger.log(`Starting GRPC approvals stream subscription from block ${startProcessHeight}`);

    const observable = this.grpcService.subscribeToApprovals(CONSTANTS.SOURCE_CHAIN_NAME, startProcessHeight);

    const onComplete = () => {
      this.logger.warn('Approvals stream subscription ended');

      this.approvalsSubscription = null;
    };
    const onError = (e: any) => {
      this.logger.error(`Approvals stream subscription ended with error...`);
      this.logger.error(e);

      this.approvalsSubscription = null;
    };

    this.approvalsSubscription = observable.subscribe({
      next: this.processMessage.bind(this),
      complete: onComplete.bind(this),
      error: onError.bind(this),
    });

    this.logger.log('GRPC approvals stream subscription started successfully!');
  }

  async handlePendingTransactionsRaw() {
    const keys = await this.redisCacheService.scan(CacheInfo.PendingTransaction('*').key);
    for (const key of keys) {
      const cachedValue = await this.redisCacheService.get<PendingTransaction>(key);

      await this.redisCacheService.delete(key);

      if (cachedValue === undefined) {
        continue;
      }

      const { txHash, externalData, retry } = cachedValue;

      const success = await this.transactionsHelper.awaitSuccess(txHash);

      // Nothing to do on success
      if (success) {
        this.logger.debug(`Transaction with hash ${txHash} was successfully executed!`);

        continue;
      }

      if (retry === MAX_NUMBER_OF_RETRIES) {
        this.logger.error(`Could not execute Gateway execute transaction with hash ${txHash} after ${retry} retries`);

        continue;
      }

      try {
        await this.executeTransaction(externalData, retry);
      } catch (e) {
        this.logger.error('Error while trying to retry Axelar Approvals response transaction...');
        this.logger.error(e);

        // Set value back in cache to be retried again (with same retry number if it failed to even be sent to the chain)
        await this.redisCacheService.set<PendingTransaction>(
          CacheInfo.PendingTransaction(txHash).key,
          {
            txHash,
            externalData: externalData,
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

    let wasError = false;
    try {
      await this.executeTransaction(response.executeData);
    } catch (e) {
      this.logger.error('Error while processing Axelar Approvals response...');
      this.logger.error(e);

      wasError = true;

      // Unsubscribe so processing stops at this event and is retried
      this.approvalsSubscription?.unsubscribe();
    } finally {
      // Set start process height to previous block height to not lose any progress in case of unexpected issues
      // It is safe to retry Gateway execute transaction that were already executed since the contract supports this
      await this.redisCacheService.set(
        CacheInfo.StartProcessHeight().key,
        response.blockHeight - (wasError ? 1 : 0), // If we had an error, save old block height for retry
        CacheInfo.StartProcessHeight().ttl,
      );
    }
  }

  // TODO: Check if it is fine to use the same wallet as in the MessageApprovedProcessor
  // and that no issues happen because of nonce
  private async executeTransaction(externalData: Uint8Array, retry: number = 0) {
    // The Amplifier for MultiversX encodes the executeData as hex, we need to decode it to string
    // It will have the format `function@arg1HEX@arg2HEX...`
    const decodedExecuteData = BinaryUtils.hexToString(Buffer.from(externalData).toString('hex'));

    this.logger.debug(`Trying to execute Gateway execute transaction with externalData:`);
    this.logger.debug(decodedExecuteData);

    const nonce = await this.transactionsHelper.getAccountNonce(this.walletSigner.getAddress());
    const transaction = this.gatewayContract.buildTransactionExternalFunction(
      decodedExecuteData,
      this.walletSigner.getAddress(),
      nonce,
    );

    const gas = await this.transactionsHelper.getTransactionGas(transaction, retry);
    transaction.setGasLimit(gas);

    const txHash = await this.transactionsHelper.signAndSendTransaction(transaction, this.walletSigner);

    await this.redisCacheService.set<PendingTransaction>(
      CacheInfo.PendingTransaction(txHash).key,
      {
        txHash,
        externalData,
        retry: retry + 1,
      },
      CacheInfo.PendingTransaction(txHash).ttl,
    );
  }
}
