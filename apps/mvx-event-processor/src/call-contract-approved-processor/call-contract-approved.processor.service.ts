import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { Locker } from '@multiversx/sdk-nestjs-common';
import { ContractCallApprovedRepository } from '@mvx-monorepo/common/database/repository/contract-call-approved.repository';
import { ProviderKeys } from '@mvx-monorepo/common/utils/provider.enum';
import { UserSigner } from '@multiversx/sdk-wallet/out';
import { ProxyNetworkProvider } from '@multiversx/sdk-network-providers/out';
import { Address, BytesValue, SmartContract, Transaction } from '@multiversx/sdk-core/out';
import { ContractCallApproved } from '@prisma/client';

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

  @Cron('*/30 * * * * *')
  async processPendingCallContractApproved() {
    await Locker.lock('processPendingCallContractApproved', async () => {
      let accountNonce = null;

      let page = 0;
      let entries;
      while ((entries = await this.callContractApprovedRepository.findPendingNoRetries(page))?.length) {
        if (accountNonce === null) {
          accountNonce = await this.getAccountNonce();
        }

        this.logger.log(`Found ${entries.length} CallContractApproved transactions to execute`);

        let transactionsToSend = [];
        for (const callContractApproved of entries) {
          this.logger.debug(
            `Trying to execute CallContractApproved transaction with commandId ${callContractApproved.commandId}`,
          );

          const transaction = this.buildTransaction(callContractApproved);
          transaction.setNonce(accountNonce);

          accountNonce++;

          transactionsToSend.push(transaction);

          // TODO: Verify that 10 is ok max for gateway
          if (transactionsToSend.length === 10) {
            await this.sendTransactionsAndLog(transactionsToSend);

            transactionsToSend = [];
          }
        }
      }
    });
  }

  private async getAccountNonce(): Promise<number> {
    const accountOnNetwork = await this.proxy.getAccount(this.walletSigner.getAddress());

    return accountOnNetwork.nonce;
  }

  // TODO:
  private buildTransaction(callContractApproved: ContractCallApproved): Transaction {
    const contract = new SmartContract({ address: new Address(callContractApproved.contractAddress) });

    return contract.call({
      caller: this.walletSigner.getAddress(),
      func: 'execute',
      gasLimit: 100_000_000, // TODO
      args: [
        new BytesValue(callContractApproved.payload),
      ],
      chainID: 'D', // TODO,
    });
  }

  private async sendTransactionsAndLog(transactions: Transaction[]) {
    try {
      await this.proxy.sendTransactions(transactions);

      this.logger.log(
        `Send ${transactions.length} transactions to proxy: ${transactions.map((trans) => trans.getHash())}`,
      );
    } catch (e) {
      this.logger.error(`Can not send CallContractApproved transactions to proxy... ${e}`);
    }
  }
}
