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
import ExecuteTask = Components.Schemas.ExecuteTask;
import { MessageApprovedRepository } from '@mvx-monorepo/common/database/repository/message-approved.repository';
import { MessageApprovedStatus } from '@prisma/client';
import RefundTask = Components.Schemas.RefundTask;

const MAX_NUMBER_OF_RETRIES = 3;

@Injectable()
export class ApprovalsProcessorService {
  private readonly logger: Logger;

  constructor(
    private readonly axelarGmpApi: AxelarGmpApi,
    private readonly redisCacheService: RedisCacheService,
    @Inject(ProviderKeys.WALLET_SIGNER) private readonly walletSigner: UserSigner,
    private readonly transactionsHelper: TransactionsHelper,
    private readonly gatewayContract: GatewayContract,
    private readonly messageApprovedRepository: MessageApprovedRepository,
  ) {
    this.logger = new Logger(ApprovalsProcessorService.name);
  }

  @Cron('*/30 * * * * *')
  async handleNewTasks() {
    await Locker.lock('handleNewTasks', this.handleNewTasksRaw.bind(this));
  }

  @Cron('*/6 * * * * *')
  async handlePendingTransactions() {
    await Locker.lock('pendingTransactions', this.handlePendingTransactionsRaw.bind(this));
  }

  async handleNewTasksRaw() {
    let lastTaskUUID = (await this.redisCacheService.get<string>(CacheInfo.LastTaskUUID().key)) || undefined;

    this.logger.log(`Trying to process tasks for multiversx starting from id: ${lastTaskUUID}`);

    // Process as many tasks as possible until no tasks are left or there is an error
    let tasks: TaskItem[] = [];
    do {
      try {
        const response = await this.axelarGmpApi.getTasks(CONSTANTS.SOURCE_CHAIN_NAME, lastTaskUUID);

        if (response.data.tasks.length === 0) {
          this.logger.log('No tasks left to process for now...');

          return;
        }

        tasks = response.data.tasks;

        for (const task of tasks) {
          try {
            await this.processTask(task);

            lastTaskUUID = task.id;

            await this.redisCacheService.set(CacheInfo.LastTaskUUID().key, lastTaskUUID, CacheInfo.LastTaskUUID().ttl);
          } catch (e) {
            this.logger.error(`Could not process task ${task.id}`, task);

            return;
          }
        }

        this.logger.log(`Successfully processed ${tasks.length}`);
      } catch (e) {
        this.logger.error('Error retrieving tasks...', e);

        return;
      }
    } while (tasks.length > 0);
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
        await this.processGatewayTxTask(externalData, retry);
      } catch (e) {
        this.logger.error('Error while trying to retry transaction...');
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

  private async processTask(task: TaskItem) {
    this.logger.debug('Received Axelar Task response:');
    this.logger.debug(JSON.stringify(task));

    if (task.type === 'GATEWAY_TX') {
      const response = task.task as GatewayTransactionTask;

      await this.processGatewayTxTask(response.executeData);

      return;
    }

    if (task.type === 'EXECUTE') {
      const response = task.task as ExecuteTask;

      await this.processExecuteTask(response);

      return;
    }

    if (task.type === 'REFUND') {
      const response = task.task as RefundTask;

      this.processRefundTask(response);

      return;
    }
  }

  // TODO: Check if it is fine to use the same wallet as in the MessageApprovedProcessor
  // and that no issues happen because of nonce
  private async processGatewayTxTask(externalData: string, retry: number = 0) {
    // The Amplifier for MultiversX encodes the executeData as hex, we need to decode it to string
    // It will have the format `function@arg1HEX@arg2HEX...`
    const decodedExecuteData = BinaryUtils.hexToString(externalData);

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

  private async processExecuteTask(response: ExecuteTask) {
    // TODO: Save data in Redis since it is only needed temporarily if refactoring to use queues?
    const messageApproved = await this.messageApprovedRepository.create({
      sourceChain: response.message.sourceChain,
      messageId: response.message.messageID,
      status: MessageApprovedStatus.PENDING,
      sourceAddress: response.message.sourceAddress,
      contractAddress: response.message.destinationAddress,
      payloadHash: response.message.payloadHash,
      payload: Buffer.from(response.payload.slice(2), 'hex'),
      retry: 0,
    });

    if (!messageApproved) {
      throw new Error(`Couldn't save message approved to database for message id ${response.message.messageID}`);
    }
  }

  private processRefundTask(response: RefundTask) {
    this.logger.warn(
      `Received a refund task for ${response.message.messageID}. However refunds are not currently supported`,
      response,
    );
  }
}
