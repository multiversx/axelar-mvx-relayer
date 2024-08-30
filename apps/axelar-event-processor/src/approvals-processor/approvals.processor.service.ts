import { BinaryUtils, Locker } from '@multiversx/sdk-nestjs-common';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { AxelarGmpApi } from '@mvx-monorepo/common/api/axelar.gmp.api';
import { RedisCacheService } from '@multiversx/sdk-nestjs-cache';
import { CacheInfo } from '@mvx-monorepo/common';
import { ProviderKeys } from '@mvx-monorepo/common/utils/provider.enum';
import { UserSigner } from '@multiversx/sdk-wallet/out';
import { TransactionsHelper } from '@mvx-monorepo/common/contracts/transactions.helper';
import { GatewayContract } from '@mvx-monorepo/common/contracts/gateway.contract';
import { PendingTransaction } from './entities/pending-transaction';
import { CONSTANTS } from '@mvx-monorepo/common/utils/constants.enum';
import { Components } from '@mvx-monorepo/common/api/entities/axelar.gmp.api';
import TaskItem = Components.Schemas.TaskItem;
import GatewayTransactionTask = Components.Schemas.GatewayTransactionTask;

const MAX_NUMBER_OF_RETRIES = 3;

@Injectable()
export class ApprovalsProcessorService {
  private readonly logger: Logger;

  constructor(
    private readonly grpcService: AxelarGmpApi,
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
    const lastTaskUUID = (await this.redisCacheService.get<string>(CacheInfo.LastTaskUUID().key)) || undefined;

    this.logger.log(`Starting GRPC approvals stream subscription from block ${lastTaskUUID}`);

    let tasks;
    while ((tasks = await this.grpcService.getTasks(CONSTANTS.SOURCE_CHAIN_NAME, lastTaskUUID))) {
      for (const task of tasks.data.tasks) {
        try {
          await this.processMessage(task);
        } catch (e) {
          this.logger.error(`Could not process task ${task.id}`, task);
        }
      }

      this.logger.log(`Successfully processed ${tasks.data.tasks.length}`);
    }

    this.logger.log('No tasks left to process for now...');
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
            externalData,
            retry,
          },
          CacheInfo.PendingTransaction(txHash).ttl,
        );
      }
    }
  }

  private async processMessage(task: TaskItem) {
    this.logger.debug('Received Axelar Task response:');
    this.logger.debug(JSON.stringify(task));

    if (task.type === 'GATEWAY_TX') {
      const response = task.task as GatewayTransactionTask;

      try {
        await this.executeTransaction(response.executeData);

        await this.redisCacheService.set(CacheInfo.LastTaskUUID().key, task.id, CacheInfo.LastTaskUUID().ttl);
      } catch (e) {
        this.logger.error('Error while processing Axelar Approvals response...');
        this.logger.error(e);
      }
    }

    // TODO: Handle other task types
  }

  private async executeTransaction(externalData: string, retry: number = 0) {
    // The Amplifier for MultiversX encodes the executeData as hex, we need to decode it to string
    // It will have the format `function@arg1HEX@arg2HEX...`
    const decodedExecuteData = BinaryUtils.hexToString(externalData.slice(2));

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
