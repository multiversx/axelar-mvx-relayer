import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { Locker } from '@multiversx/sdk-nestjs-common';
import { ContractCallApprovedRepository } from '@mvx-monorepo/common/database/repository/contract-call-approved.repository';
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
import { ContractCallApproved, ContractCallApprovedStatus } from '@prisma/client';
import { TransactionsHelper } from '@mvx-monorepo/common/contracts/transactions.helper';
import { ApiConfigService } from '@mvx-monorepo/common';

// Support a max of 3 retries (mainly because some Interchain Token Service endpoints need to be called 3 times)
const MAX_NUMBER_OF_RETRIES: number = 3;

@Injectable()
export class CallContractApprovedProcessorService {
  private readonly logger: Logger;

  private readonly chainId: string;

  constructor(
    private readonly contractCallApprovedRepository: ContractCallApprovedRepository,
    @Inject(ProviderKeys.WALLET_SIGNER) private readonly walletSigner: UserSigner,
    private readonly transactionsHelper: TransactionsHelper,
    apiConfigService: ApiConfigService,
  ) {
    this.logger = new Logger(CallContractApprovedProcessorService.name);
    this.chainId = apiConfigService.getChainId();
  }

  @Cron('*/30 * * * * *')
  async processPendingContractCallApproved() {
    await Locker.lock('processPendingContractCallApproved', async () => {
      this.logger.debug('Running processPendingContractCallApproved cron');

      let accountNonce = null;

      let page = 0;
      let entries;
      while ((entries = await this.contractCallApprovedRepository.findPending(page))?.length) {
        if (accountNonce === null) {
          accountNonce = await this.transactionsHelper.getAccountNonce(this.walletSigner.getAddress());
        }

        this.logger.log(`Found ${entries.length} CallContractApproved transactions to execute`);

        const transactionsToSend = [];
        for (const contractCallApproved of entries) {
          if (contractCallApproved.retry === MAX_NUMBER_OF_RETRIES) {
            this.logger.error(
              `Could not execute ContractCallApproved transaction with commandId ${contractCallApproved.commandId} after ${contractCallApproved.retry} retries`,
            );

            contractCallApproved.status = ContractCallApprovedStatus.FAILED;

            continue;
          }

          this.logger.debug(
            `Trying to execute ContractCallApproved transaction with commandId ${contractCallApproved.commandId}`,
          );

          const transaction = await this.buildExecuteTransaction(contractCallApproved, accountNonce);

          accountNonce++;

          transactionsToSend.push(transaction);

          contractCallApproved.executeTxHash = transaction.getHash().toString();
          contractCallApproved.retry += 1;
        }

        const result = await this.transactionsHelper.sendTransactions(transactionsToSend);

        if (result) {
          // Page is not modified if database records are updated
          await this.contractCallApprovedRepository.updateManyStatusRetryExecuteTxHash(entries);
        } else {
          page++;
        }
      }
    });
  }

  private async buildExecuteTransaction(
    contractCallApproved: ContractCallApproved,
    accountNonce: number,
  ): Promise<Transaction> {
    const contract = new SmartContract({ address: new Address(contractCallApproved.contractAddress) });

    const args = [
      new BytesValue(Buffer.from(contractCallApproved.commandId, 'hex')),
      new StringValue(contractCallApproved.sourceChain),
      new StringValue(contractCallApproved.sourceAddress),
      new BytesValue(contractCallApproved.payload),
    ];

    const interaction = new Interaction(contract, new ContractFunction('execute'), args);

    const transaction = interaction
      .withSender(this.walletSigner.getAddress())
      .withNonce(accountNonce)
      // .withValue() // TODO: Handle ITS transactions where EGLD value needs to be sent for deploying ESDT token
      .withChainID(this.chainId)
      .buildTransaction();

    const gas = await this.transactionsHelper.getTransactionGas(transaction, contractCallApproved.retry);
    transaction.setGasLimit(gas);

    const signature = await this.walletSigner.sign(transaction.serializeForSigning());
    transaction.applySignature(signature);

    return transaction;
  }
}
