import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { MessageApprovedRepository } from '@mvx-monorepo/common/database/repository/message-approved.repository';
import { ProviderKeys } from '@mvx-monorepo/common/utils/provider.enum';
import { UserSigner } from '@multiversx/sdk-wallet/out';
import {
  Address,
  BytesValue,
  ContractFunction,
  Interaction,
  SmartContract,
  StringValue,
  Transaction,
} from '@multiversx/sdk-core/out';
import { MessageApproved, MessageApprovedStatus } from '@prisma/client';
import { TransactionsHelper } from '@mvx-monorepo/common/contracts/transactions.helper';
import { ApiConfigService, AxelarGmpApi } from '@mvx-monorepo/common';
import { ItsContract } from '@mvx-monorepo/common/contracts/its.contract';
import { Locker } from '@multiversx/sdk-nestjs-common';
import { GasError, NotEnoughGasError } from '@mvx-monorepo/common/contracts/entities/gas.error';
import { CannotExecuteMessageReason, Components, Event } from '@mvx-monorepo/common/api/entities/axelar.gmp.api';
import { AxiosError } from 'axios';
import { DecodingUtils } from '@mvx-monorepo/common/utils/decoding.utils';
import { FeeHelper } from '@mvx-monorepo/common/contracts/fee.helper';
import { CONSTANTS } from '@mvx-monorepo/common/utils/constants.enum';
import CannotExecuteMessageEventV2 = Components.Schemas.CannotExecuteMessageEventV2;

// Support a max of 3 retries (mainly because some Interchain Token Service endpoints need to be called 2 times)
const MAX_NUMBER_OF_RETRIES: number = 3;

@Injectable()
export class MessageApprovedProcessorService {
  private readonly logger: Logger;

  private readonly chainId: string;
  private readonly contractItsAddress: string;

  constructor(
    private readonly messageApprovedRepository: MessageApprovedRepository,
    @Inject(ProviderKeys.WALLET_SIGNER) private readonly walletSigner: UserSigner,
    private readonly transactionsHelper: TransactionsHelper,
    private readonly itsContract: ItsContract,
    private readonly axelarGmpApi: AxelarGmpApi,
    private readonly feeHelper: FeeHelper,
    apiConfigService: ApiConfigService,
  ) {
    this.logger = new Logger(MessageApprovedProcessorService.name);
    this.chainId = apiConfigService.getChainId();
    this.contractItsAddress = apiConfigService.getContractIts();
  }

  @Cron('10/15 * * * * *')
  async processPendingMessageApproved() {
    await Locker.lock('processPendingMessageApproved', async () => {
      this.logger.debug('Running processPendingMessageApproved cron');

      let accountNonce = null;

      // Always start processing from beginning (page 0) since the query will skip recently updated entries
      let entries;
      while ((entries = await this.messageApprovedRepository.findPending(0))?.length) {
        if (accountNonce === null) {
          accountNonce = await this.transactionsHelper.getAccountNonce(this.walletSigner.getAddress());
        }

        this.logger.log(`Found ${entries.length} CallContractApproved transactions to execute`);

        const transactionsToSend: Transaction[] = [];
        const entriesToUpdate: MessageApproved[] = [];
        const entriesWithTransactions: MessageApproved[] = [];

        const firstTransactionAccountNonce = accountNonce;

        for (const messageApproved of entries) {
          if (messageApproved.retry >= MAX_NUMBER_OF_RETRIES) {
            await this.handleMessageApprovedFailed(messageApproved);

            entriesToUpdate.push(messageApproved);

            continue;
          }

          this.logger.debug(
            `Trying to execute MessageApproved transaction from ${messageApproved.sourceChain} with message id ${messageApproved.messageId}`,
          );

          if (!messageApproved.payload.length) {
            this.logger.error(
              `Can not send transaction without payload from ${messageApproved.sourceChain} with message id ${messageApproved.messageId}`,
            );

            messageApproved.status = MessageApprovedStatus.FAILED;

            entriesToUpdate.push(messageApproved);

            continue;
          }

          try {
            const transaction = await this.buildAndSignExecuteTransaction(
              messageApproved,
              accountNonce,
              firstTransactionAccountNonce,
            );

            accountNonce++;

            transactionsToSend.push(transaction);

            messageApproved.executeTxHash = transaction.getHash().toString();
            messageApproved.retry += 1;

            entriesWithTransactions.push(messageApproved);
          } catch (e) {
            // In case of NotEnoughGasError, don't retry the transaction and mark it as failed instantly
            if (e instanceof NotEnoughGasError) {
              messageApproved.retry = MAX_NUMBER_OF_RETRIES;
              messageApproved.status = MessageApprovedStatus.FAILED;

              await this.handleMessageApprovedFailed(messageApproved, 'INSUFFICIENT_GAS');

              entriesToUpdate.push(messageApproved);
            } else {
              this.logger.error(
                `Could not build and sign execute transaction for ${messageApproved.sourceChain} ${messageApproved.messageId}`,
                e,
              );

              throw e;
            }
          }
        }

        const hashes = await this.transactionsHelper.sendTransactions(transactionsToSend);

        if (hashes) {
          entriesWithTransactions.forEach((entry) => {
            const sent = hashes.includes(entry.executeTxHash as string);

            // If not sent revert fields but still save to database so it is retried later and does
            // not block the processing
            if (!sent) {
              entry.executeTxHash = null;
              entry.retry = entry.retry === 1 ? 1 : entry.retry - 1; // retry should be 1 or more to not be processed immediately

              // re-retrieve account nonce in case not all transactions were succesfully sent
              accountNonce = null;
            }

            entriesToUpdate.push(entry);
          });
        } else {
          // re-retrieve account nonce in case sendTransactions failed because of nonce error
          accountNonce = null;
        }

        if (entriesToUpdate.length) {
          await this.messageApprovedRepository.updateManyPartial(entriesToUpdate);
        }
      }
    });
  }

  private async buildAndSignExecuteTransaction(
    messageApproved: MessageApproved,
    accountNonce: number,
    firstTransactionAccountNonce: number,
  ): Promise<Transaction> {
    const interaction = await this.buildExecuteInteraction(messageApproved);

    const transaction = interaction
      .withSender(this.walletSigner.getAddress())
      .withNonce(firstTransactionAccountNonce) // Always estimate gas with first transaction account nonce
      .withChainID(this.chainId)
      .buildTransaction();

    try {
      const gas = await this.transactionsHelper.getTransactionGas(transaction, messageApproved.retry);

      transaction.setGasLimit(gas);

      this.feeHelper.checkGasCost(gas, transaction.getValue(), transaction.getData(), messageApproved);
    } catch (e) {
      // In case the gas estimation fails, the transaction will fail on chain, but we will still send it
      // for transparency with the full gas available, but don't try to retry it
      if (e instanceof GasError) {
        const gasLimit = this.feeHelper.getGasLimitFromEgldFee(
          BigInt(messageApproved.availableGasBalance),
          transaction.getData(),
        );

        this.logger.warn(
          `Could not estimate gas for execute transaction... Sending transaction with max gas limit ${gasLimit}`,
          e,
        );

        transaction.setGasLimit(gasLimit);

        // Set retry to last retry (will be incremented by +1 in processPendingMessageApproved)
        messageApproved.retry = MAX_NUMBER_OF_RETRIES - 1;
      } else {
        throw e;
      }
    }

    transaction.setNonce(accountNonce); // Set correct nonce after gas estimation

    const signature = await this.walletSigner.sign(transaction.serializeForSigning());
    transaction.applySignature(signature);

    return transaction;
  }

  private async buildExecuteInteraction(messageApproved: MessageApproved) {
    if (messageApproved.contractAddress !== this.contractItsAddress) {
      const contract = new SmartContract({ address: new Address(messageApproved.contractAddress) });

      const args = [
        new StringValue(messageApproved.sourceChain),
        new StringValue(messageApproved.messageId),
        new StringValue(messageApproved.sourceAddress),
        new BytesValue(messageApproved.payload),
      ];

      return new Interaction(contract, new ContractFunction('execute'), args);
    }

    // In case first transaction exists for ITS, wait for it to complete and mark it as successful if necessary
    if (messageApproved.executeTxHash && !messageApproved.successTimes) {
      const success = await this.transactionsHelper.awaitSuccess(messageApproved.executeTxHash);

      if (success) {
        messageApproved.successTimes = 1;
      }
    }

    return this.itsContract.execute(
      messageApproved.sourceChain,
      messageApproved.messageId,
      messageApproved.sourceAddress,
      messageApproved.payload,
      messageApproved.successTimes || 0,
    );
  }

  private async handleMessageApprovedFailed(
    messageApproved: MessageApproved,
    reason: CannotExecuteMessageReason = 'ERROR',
  ) {
    this.logger.error(
      `Could not execute MessageApproved from ${messageApproved.sourceChain} with message id ${messageApproved.messageId} after ${messageApproved.retry} retries`,
    );

    messageApproved.status = MessageApprovedStatus.FAILED;

    const cannotExecuteEvent: CannotExecuteMessageEventV2 = {
      eventID: messageApproved.executeTxHash
        ? DecodingUtils.getEventId(messageApproved.executeTxHash, 0)
        : messageApproved.messageId,
      messageID: messageApproved.messageId,
      sourceChain: CONSTANTS.SOURCE_CHAIN_NAME,
      reason,
      details: `retried ${messageApproved.retry} times`,
      meta: {
        txID: messageApproved.executeTxHash,
        taskItemID: messageApproved.taskItemId || '',
      },
    };

    try {
      const eventsToSend: Event[] = [
        {
          type: 'CANNOT_EXECUTE_MESSAGE/V2',
          ...cannotExecuteEvent,
        },
      ];

      await this.axelarGmpApi.postEvents(eventsToSend, messageApproved.executeTxHash || '');
    } catch (e) {
      this.logger.error('Could not send all events to GMP API...', e);

      if (e instanceof AxiosError) {
        this.logger.error(e.response);
      }

      throw e;
    }
  }
}
