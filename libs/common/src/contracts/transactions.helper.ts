import { Injectable, Logger } from '@nestjs/common';
import { ProxyNetworkProvider } from '@multiversx/sdk-network-providers/out';
import { Transaction, TransactionHash, TransactionWatcher } from '@multiversx/sdk-core/out';
import { UserAddress } from '@multiversx/sdk-wallet/out/userAddress';

@Injectable()
export class TransactionsHelper {
  private readonly logger: Logger;

  constructor(private readonly proxy: ProxyNetworkProvider, private readonly transactionWatcher: TransactionWatcher) {
    this.logger = new Logger(TransactionsHelper.name);
  }

  async getAccountNonce(address: UserAddress): Promise<number> {
    const accountOnNetwork = await this.proxy.getAccount(address);

    return accountOnNetwork.nonce;
  }

  // TODO: Check if this works properly
  async getTransactionGas(transaction: Transaction, retry: number = 0): Promise<number> {
    const result = await this.proxy.doPostGeneric('transaction/cost', transaction.toSendable());

    return (result.data.txGasUnits * (11 + retry * 2)) / 10; // add 10% extra gas initially, and more gas with each retry
  }

  async sendTransaction(transaction: Transaction) {
    try {
      const hash = await this.proxy.sendTransaction(transaction);

      this.logger.log(`Sent transaction to proxy: ${transaction.getHash()}`);

      return hash;
    } catch (e) {
      this.logger.error(`Can not send transaction to proxy...`);
      this.logger.error(e);

      throw e;
    }
  }

  async sendTransactions(transactions: Transaction[]) {
    try {
      await this.proxy.sendTransactions(transactions);

      this.logger.log(
        `Sent ${transactions.length} transactions to proxy: ${transactions.map((trans) => trans.getHash())}`,
      );

      return true;
    } catch (e) {
      this.logger.error(`Can not send transactions to proxy...`);
      this.logger.error(e);

      return false;
    }
  }

  async awaitComplete(txHash: string) {
    try {
      const result = await this.transactionWatcher.awaitCompleted({ getHash: () => new TransactionHash(txHash) });

      return !result.status.isFailed() && !result.status.isInvalid();
    } catch (e) {
      this.logger.error(`Can not await transaction completed`);
      this.logger.error(e);

      return false;
    }
  }
}
