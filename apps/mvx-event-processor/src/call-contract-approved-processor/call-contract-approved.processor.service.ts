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
import { ItsContract } from '@mvx-monorepo/common/contracts/its.contract';

// Support a max of 3 retries (mainly because some Interchain Token Service endpoints need to be called 2 times)
const MAX_NUMBER_OF_RETRIES: number = 3;

@Injectable()
export class CallContractApprovedProcessorService {
  private readonly logger: Logger;

  private readonly chainId: string;
  private readonly contractItsAddress: string;

  constructor(
    private readonly contractCallApprovedRepository: ContractCallApprovedRepository,
    @Inject(ProviderKeys.WALLET_SIGNER) private readonly walletSigner: UserSigner,
    private readonly transactionsHelper: TransactionsHelper,
    private readonly itsContract: ItsContract,
    apiConfigService: ApiConfigService,
  ) {
    this.logger = new Logger(CallContractApprovedProcessorService.name);
    this.chainId = apiConfigService.getChainId();
    this.contractItsAddress = apiConfigService.getContractIts();
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

          const transaction = await this.buildAndSignExecuteTransaction(contractCallApproved, accountNonce);

          accountNonce++;

          transactionsToSend.push(transaction);

          contractCallApproved.executeTxHash = transaction.getHash().toString();
          contractCallApproved.retry += 1;
        }

        const hashes = await this.transactionsHelper.sendTransactions(transactionsToSend);

        if (hashes) {
          const actuallySentEntries = entries.filter(entry => hashes.includes(entry.executeTxHash as string));

          // Page is not modified if database records are updated
          await this.contractCallApprovedRepository.updateManyPartial(actuallySentEntries);
        } else {
          // re-retrieve account nonce in case sendTransactions failed because of nonce error
          accountNonce = null;

          page++;
        }
      }
    });
  }

  private async buildAndSignExecuteTransaction(
    contractCallApproved: ContractCallApproved,
    accountNonce: number,
  ): Promise<Transaction> {
    const interaction = await this.buildExecuteInteraction(contractCallApproved);

    const transaction = interaction
      .withSender(this.walletSigner.getAddress())
      .withNonce(accountNonce)
      .withChainID(this.chainId)
      .buildTransaction();

    const gas = await this.transactionsHelper.getTransactionGas(transaction, contractCallApproved.retry);
    transaction.setGasLimit(gas);

    const signature = await this.walletSigner.sign(transaction.serializeForSigning());
    transaction.applySignature(signature);

    return transaction;
  }

  private async buildExecuteInteraction(contractCallApproved: ContractCallApproved) {
    const commandId = Buffer.from(contractCallApproved.commandId, 'hex');

    if (contractCallApproved.contractAddress !== this.contractItsAddress) {
      const contract = new SmartContract({ address: new Address(contractCallApproved.contractAddress) });

      const args = [
        new BytesValue(commandId),
        new StringValue(contractCallApproved.sourceChain),
        new StringValue(contractCallApproved.sourceAddress),
        new BytesValue(contractCallApproved.payload),
      ];

      return new Interaction(contract, new ContractFunction('execute'), args);
    }

    // In case first transaction exists for ITS, wait for it to complete and mark it as successful if necessary
    if (contractCallApproved.executeTxHash && !contractCallApproved.successTimes) {
      const success = await this.transactionsHelper.awaitSuccess(contractCallApproved.executeTxHash);

      if (success) {
        contractCallApproved.successTimes = 1;
      }
    }

    return this.itsContract.execute(
      commandId,
      contractCallApproved.sourceChain,
      contractCallApproved.sourceAddress,
      contractCallApproved.payload,
      contractCallApproved.successTimes || 0,
    );
  }
}
