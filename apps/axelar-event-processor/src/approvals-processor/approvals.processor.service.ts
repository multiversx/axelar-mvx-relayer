import { BinaryUtils, Locker } from '@multiversx/sdk-nestjs-common';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { AxelarGmpApi } from '@mvx-monorepo/common/api/axelar.gmp.api';
import { RedisCacheService } from '@multiversx/sdk-nestjs-cache';
import { CacheInfo, GasServiceContract } from '@mvx-monorepo/common';
import { ProviderKeys } from '@mvx-monorepo/common/utils/provider.enum';
import { UserSigner } from '@multiversx/sdk-wallet/out';
import { TransactionsHelper } from '@mvx-monorepo/common/contracts/transactions.helper';
import { GatewayContract } from '@mvx-monorepo/common/contracts/gateway.contract';
import { PendingTransaction } from './entities/pending-transaction';
import { CONSTANTS } from '@mvx-monorepo/common/utils/constants.enum';
import { Components, VerifyTask } from '@mvx-monorepo/common/api/entities/axelar.gmp.api';
import { MessageApprovedRepository } from '@mvx-monorepo/common/database/repository/message-approved.repository';
import { MessageApprovedStatus } from '@prisma/client';
import { ApiNetworkProvider } from '@multiversx/sdk-network-providers/out';
import BigNumber from 'bignumber.js';
import TaskItem = Components.Schemas.TaskItem;
import GatewayTransactionTask = Components.Schemas.GatewayTransactionTask;
import ExecuteTask = Components.Schemas.ExecuteTask;
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
    private readonly gasServiceContract: GasServiceContract,
    private readonly api: ApiNetworkProvider,
  ) {
    this.logger = new Logger(ApprovalsProcessorService.name);
  }

  @Cron('0/20 * * * * *')
  async handleNewTasks() {
    await Locker.lock('handleNewTasks', this.handleNewTasksRaw.bind(this));
  }

  @Cron('3/6 * * * * *')
  async handlePendingTransactions() {
    await Locker.lock('pendingTransactions', this.handlePendingTransactionsRaw.bind(this));
  }

  async handleNewTasksRaw() {
    let lastTaskUUID = (await this.redisCacheService.get<string>(CacheInfo.LastTaskUUID().key)) || undefined;

    this.logger.debug(`Trying to process tasks for multiversx starting from id: ${lastTaskUUID}`);

    // Process as many tasks as possible until no tasks are left or there is an error
    let tasks: TaskItem[] = [];
    do {
      try {
        const response = await this.axelarGmpApi.getTasks(CONSTANTS.SOURCE_CHAIN_NAME, lastTaskUUID);

        if (response.data.tasks.length === 0) {
          this.logger.debug('No tasks left to process for now...');

          return;
        }

        tasks = response.data.tasks;

        for (const task of tasks) {
          try {
            // await this.processTask(task);

            lastTaskUUID = task.id;

            await this.redisCacheService.set(CacheInfo.LastTaskUUID().key, lastTaskUUID, CacheInfo.LastTaskUUID().ttl);
          } catch (e) {
            this.logger.error(`Could not process task ${task.id}`, task, e);

            // Stop processing in case of an error and retry from the sam task
            return;
          }
        }

        this.logger.debug(`Successfully processed ${tasks.length} tasks`);
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

      await this.processExecuteTask(response, task.id);

      return;
    }

    if (task.type === 'REFUND') {
      const response = task.task as RefundTask;

      await this.processRefundTask(response);

      return;
    }

    if (task.type === 'VERIFY') {
      const response = task.task as VerifyTask;

      await this.processGatewayTxTask(response.payload);

      return;
    }
  }

  private async processGatewayTxTask(externalData: string, retry: number = 0) {
    // The Amplifier for MultiversX encodes the executeData as hex, we need to decode it to string
    // It will have the format `function@arg1HEX@arg2HEX...`
    const decodedExecuteData = BinaryUtils.base64Decode(externalData);

    this.logger.debug(`Trying to execute Gateway transaction with externalData:`);
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

  private async processExecuteTask(response: ExecuteTask, taskItemId: string) {
    await this.messageApprovedRepository.createOrUpdate({
      sourceChain: response.message.sourceChain,
      messageId: response.message.messageID,
      status: MessageApprovedStatus.PENDING,
      sourceAddress: response.message.sourceAddress,
      contractAddress: response.message.destinationAddress,
      payloadHash: BinaryUtils.base64ToHex(response.message.payloadHash),
      payload: Buffer.from(response.payload, 'base64'),
      retry: 0,
      taskItemId,
      // Only support native token for gas
      availableGasBalance: !response.availableGasBalance.tokenID ? response.availableGasBalance.amount : '0',
    });
  }

  private async processRefundTask(response: RefundTask) {
    let tokenBalance: BigNumber;

    try {
      if (response.remainingGasBalance.tokenID) {
        const token = await this.api.getFungibleTokenOfAccount(
          this.gasServiceContract.getContractAddress(),
          response.remainingGasBalance.tokenID,
        );

        tokenBalance = token.balance;
      } else {
        const account = await this.api.getAccount(this.gasServiceContract.getContractAddress());

        tokenBalance = account.balance;
      }

      if (tokenBalance.lt(response.remainingGasBalance.amount)) {
        throw new Error(
          `Insufficient balance for token ${response.remainingGasBalance.tokenID || CONSTANTS.EGLD_IDENTIFIER}` +
            ` in gas service contract ${this.gasServiceContract.getContractAddress()}. Needed ${response.remainingGasBalance.amount},` +
            ` but balance is ${tokenBalance.toFixed()}`,
        );
      }
    } catch (e) {
      this.logger.error(
        `Could not process refund for ${response.message.messageID}, for account ${response.refundRecipientAddress},` +
          ` token ${response.remainingGasBalance.tokenID}, amount ${response.remainingGasBalance.amount}`,
        e,
      );

      return;
    }

    const [messageTxHash, logIndex] = response.message.messageID.split('-');

    const transaction = this.gasServiceContract.refund(
      this.walletSigner.getAddress(),
      messageTxHash.slice(2), // Remove 0x from start
      logIndex,
      response.refundRecipientAddress,
      response.remainingGasBalance.tokenID || CONSTANTS.EGLD_IDENTIFIER,
      response.remainingGasBalance.amount,
    );

    // If transaction generation fails, the task will be retried in parent function
    const txHash = await this.transactionsHelper.signAndSendTransactionAndGetNonce(transaction, this.walletSigner);

    this.logger.debug(`Processed refund for ${response.message.messageID}, sent transaction ${txHash}`);
  }
}
