import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { Locker } from '@multiversx/sdk-nestjs-common';
import {
  ContractCallApprovedRepository,
  MAX_NUMBER_OF_RETRIES,
} from '@mvx-monorepo/common/database/repository/contract-call-approved.repository';
import { ProviderKeys } from '@mvx-monorepo/common/utils/provider.enum';
import { UserSigner } from '@multiversx/sdk-wallet/out';
import { ProxyNetworkProvider } from '@multiversx/sdk-network-providers/out';
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
import { GetOrSetCache } from '@mvx-monorepo/common/decorators/get.or.set.cache';
import { CacheInfo } from '@mvx-monorepo/common';

@Injectable()
export class CallContractApprovedProcessorService {
  private readonly logger: Logger;

  constructor(
    private readonly callContractApprovedRepository: ContractCallApprovedRepository,
    @Inject(ProviderKeys.WALLET_SIGNER) private readonly walletSigner: UserSigner,
    private readonly proxy: ProxyNetworkProvider,
  ) {
    this.logger = new Logger(CallContractApprovedProcessorService.name);
  }

  // execute every 30 seconds, starting from second 0
  @Cron('0/30 * * * * *')
  async processPendingCallContractApproved() {
    await Locker.lock('processCallContractApproved', async () => {
      this.logger.debug('Running processPendingCallContractApproved cron');

      let accountNonce = null;
      const chainId = await this.getChainId();

      let page = 0;
      let entries;
      while ((entries = await this.callContractApprovedRepository.findPendingNoRetries(page))?.length) {
        if (accountNonce === null) {
          accountNonce = await this.getAccountNonce();
        }

        this.logger.log(`Found ${entries.length} CallContractApproved transactions to execute`);

        const transactionsToSend = [];
        for (const contractCallApproved of entries) {
          this.logger.debug(
            `Trying to execute ContractCallApproved transaction with commandId ${contractCallApproved.commandId}`,
          );

          const transaction = await this.buildTransaction(contractCallApproved, accountNonce, chainId);

          accountNonce++;

          transactionsToSend.push(transaction);

          contractCallApproved.executeTxHash = transaction.getHash().toString();
        }

        const result = await this.sendTransactionsAndUpdateEntries(transactionsToSend);

        if (result) {
          // Page is not modified if database records are updated
          await this.callContractApprovedRepository.updateManyStatusRetryExecuteTxHash(entries);
        } else {
          page++;
        }
      }
    });
  }

  // execute every 60 seconds, starting from second 15 (so it shouldn't intersect with the cronjob above)
  @Cron('15/60 * * * * *')
  async processRetryCallContractApproved() {
    // Use same lock as above to make sure account nonce is handled correctly
    await Locker.lock('processCallContractApproved', async () => {
      this.logger.debug('Running processRetryCallContractApproved cron');

      let accountNonce = null;
      const chainId = await this.getChainId();

      let page = 0;
      let entries;
      while ((entries = await this.callContractApprovedRepository.findPendingForRetry(page))?.length) {
        if (accountNonce === null) {
          accountNonce = await this.getAccountNonce();
        }

        this.logger.log(`Found ${entries.length} CallContractApproved transactions to retry execute`);

        const transactionsToSend = [];
        for (const contractCallApproved of entries) {
          contractCallApproved.retry += 1;

          if (contractCallApproved.retry === MAX_NUMBER_OF_RETRIES) {
            this.logger.error(
              `Could not execute ContractCallApproved transaction with commandId ${contractCallApproved.commandId}`,
            );

            contractCallApproved.status = ContractCallApprovedStatus.FAILED;

            continue;
          }

          this.logger.debug(
            `Trying to execute ContractCallApproved transaction with commandId ${contractCallApproved.commandId}`,
          );

          const transaction = await this.buildTransaction(contractCallApproved, accountNonce, chainId);

          accountNonce++;

          transactionsToSend.push(transaction);

          contractCallApproved.executeTxHash = transaction.getHash().toString();
        }

        const result = await this.sendTransactionsAndUpdateEntries(transactionsToSend);

        if (result) {
          // Page is not modified if database records are updated
          await this.callContractApprovedRepository.updateManyStatusRetryExecuteTxHash(entries);
        } else {
          page++;
        }
      }
    });
  }

  private async getAccountNonce(): Promise<number> {
    const accountOnNetwork = await this.proxy.getAccount(this.walletSigner.getAddress());

    return accountOnNetwork.nonce;
  }

  @GetOrSetCache(CacheInfo.ChainId)
  private async getChainId(): Promise<string> {
    const result = await this.proxy.getNetworkConfig();

    return result.ChainID;
  }

  private async buildTransaction(
    contractCallApproved: ContractCallApproved,
    accountNonce: number,
    chainId: string,
  ): Promise<Transaction> {
    const contract = new SmartContract({ address: new Address(contractCallApproved.contractAddress) });

    // TODO: Check if this encoding is correct
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
      .withChainID(chainId)
      .buildTransaction();

    const gas = await this.getTransactionGas(transaction, contractCallApproved.retry);
    transaction.setGasLimit(gas);

    const signature = await this.walletSigner.sign(transaction.serializeForSigning());
    transaction.applySignature(signature);

    return transaction;
  }

  private async sendTransactionsAndUpdateEntries(transactions: Transaction[]) {
    try {
      await this.proxy.sendTransactions(transactions);

      this.logger.log(
        `Sent ${transactions.length} transactions to proxy: ${transactions.map((trans) => trans.getHash())}`,
      );

      return true;
    } catch (e) {
      this.logger.error(`Can not send CallContractApproved transactions to proxy... ${e}`);

      return false;
    }
  }

  // TODO: Check if this works properly
  private async getTransactionGas(transaction: Transaction, retry: number): Promise<number> {
    const result = await this.proxy.doPostGeneric('transaction/cost', transaction.toSendable());

    return (result.data.txGasUnits * (11 + retry * 2)) / 10; // add 10% extra gas initially, and more gas with each retry
  }
}
