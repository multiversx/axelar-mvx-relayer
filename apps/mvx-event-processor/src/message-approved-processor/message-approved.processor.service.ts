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
import { ApiConfigService } from '@mvx-monorepo/common';
import { ItsContract } from '@mvx-monorepo/common/contracts/its.contract';

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
    apiConfigService: ApiConfigService,
  ) {
    this.logger = new Logger(MessageApprovedProcessorService.name);
    this.chainId = apiConfigService.getChainId();
    this.contractItsAddress = apiConfigService.getContractIts();
  }

  @Cron('*/30 * * * * *')
  async processPendingMessageApproved() {
    // await Locker.lock('processPendingMessageApproved', async () => {
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
        for (const messageApproved of entries) {
          if (messageApproved.retry === MAX_NUMBER_OF_RETRIES) {
            this.logger.error(
              `Could not execute MessageApproved transaction with commandId ${messageApproved.commandId} after ${messageApproved.retry} retries`,
            );

            messageApproved.status = MessageApprovedStatus.FAILED;

            entriesToUpdate.push(messageApproved);

            continue;
          }

          this.logger.debug(
            `Trying to execute MessageApproved transaction with commandId ${messageApproved.commandId}`,
          );

          const transaction = await this.buildAndSignExecuteTransaction(messageApproved, accountNonce);

          accountNonce++;

          transactionsToSend.push(transaction);

          messageApproved.executeTxHash = transaction.getHash().toString();
          messageApproved.retry += 1;

          entriesWithTransactions.push(messageApproved);
        }

        const hashes = await this.transactionsHelper.sendTransactions(transactionsToSend);

        if (hashes) {
          entriesWithTransactions.forEach(entry => {
            const sent = hashes.includes(entry.executeTxHash as string);

            // If not sent revert fields but still save to database so it is retried later and does
            // not block the processing
            if (!sent) {
              entry.executeTxHash = null;
              entry.retry = entry.retry === 1 ? 1 : entry.retry - 1; // retry should be 1 or more to not be processed immediately
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
    // });
  }

  private async buildAndSignExecuteTransaction(
    messageApproved: MessageApproved,
    accountNonce: number,
  ): Promise<Transaction> {
    const interaction = await this.buildExecuteInteraction(messageApproved);

    const transaction = interaction
      .withSender(this.walletSigner.getAddress())
      .withNonce(accountNonce)
      .withChainID(this.chainId)
      .buildTransaction();

    const gas = await this.transactionsHelper.getTransactionGas(transaction, messageApproved.retry);
    transaction.setGasLimit(gas);

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
}
