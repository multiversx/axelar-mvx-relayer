import { Injectable, Logger } from '@nestjs/common';
import { ProxyNetworkProvider } from '@multiversx/sdk-network-providers/out';
import { Transaction, TransactionHash, TransactionWatcher } from '@multiversx/sdk-core/out';
import { UserAddress } from '@multiversx/sdk-wallet/out/userAddress';
import { UserSigner } from '@multiversx/sdk-wallet/out';
import { ApiConfigService } from '@mvx-monorepo/common/config';

@Injectable()
export class TransactionsHelper {
  private readonly logger: Logger;

  private readonly chainId: string;

  constructor(
    private readonly proxy: ProxyNetworkProvider,
    private readonly transactionWatcher: TransactionWatcher,
    apiConfigService: ApiConfigService,
  ) {
    this.logger = new Logger(TransactionsHelper.name);

    this.chainId = apiConfigService.getChainId();
  }

  async getAccountNonce(address: UserAddress): Promise<number> {
    const accountOnNetwork = await this.proxy.getAccount(address);

    return accountOnNetwork.nonce;
  }

  // TODO: Check if this works properly
  async getTransactionGas(transaction: Transaction, retry: number): Promise<number> {
    transaction.setChainID(this.chainId);

    const result = await this.proxy.doPostGeneric('transaction/cost', transaction.toSendable());

    return (result.data.txGasUnits * (11 + retry * 2)) / 10; // add 10% extra gas initially, and more gas with each retry
  }

  async signAndSendTransaction(transaction: Transaction, signer: UserSigner) {
    try {
      // TODO: Check if it is fine to use the same wallet as in the CallContractApprovedProcessor
      // and that no issues happen because of nonce
      const accountNonce = await this.getAccountNonce(signer.getAddress());

      transaction.setNonce(accountNonce);
      transaction.setSender(signer.getAddress());
      transaction.setChainID(this.chainId);

      const signature = await signer.sign(transaction.serializeForSigning());
      transaction.applySignature(signature);

      const hash = await this.proxy.sendTransaction(transaction);

      this.logger.log(`Sent transaction to proxy: ${transaction.getHash()}`);

      return hash;
    } catch (e) {
      this.logger.error(`Can not sign or send transaction to proxy...`);
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
