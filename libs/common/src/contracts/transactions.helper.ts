import { Injectable, Logger } from '@nestjs/common';
import { ProxyNetworkProvider } from '@multiversx/sdk-network-providers/out';
import { Transaction } from '@multiversx/sdk-core/out';
import { UserAddress } from '@multiversx/sdk-wallet/out/userAddress';

@Injectable()
export class TransactionsHelper {
  private readonly logger: Logger;

  constructor(private readonly proxy: ProxyNetworkProvider) {
    this.logger = new Logger(TransactionsHelper.name);
  }

  async getAccountNonce(address: UserAddress): Promise<number> {
    const accountOnNetwork = await this.proxy.getAccount(address);

    return accountOnNetwork.nonce;
  }

  // TODO: Check if this works properly
  async getTransactionGas(transaction: Transaction, retry: number): Promise<number> {
    const result = await this.proxy.doPostGeneric('transaction/cost', transaction.toSendable());

    return (result.data.txGasUnits * (11 + retry * 2)) / 10; // add 10% extra gas initially, and more gas with each retry
  }

  async sendTransactions(transactions: Transaction[]) {
    try {
      await this.proxy.sendTransactions(transactions);

      this.logger.log(
        `Sent ${transactions.length} transactions to proxy: ${transactions.map((trans) => trans.getHash())}`,
      );

      return true;
    } catch (e) {
      this.logger.error(`Can not send transactions to proxy... ${e}`);

      return false;
    }
  }
}
