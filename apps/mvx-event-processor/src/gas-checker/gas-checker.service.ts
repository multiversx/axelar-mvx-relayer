import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ProviderKeys } from '@mvx-monorepo/common/utils/provider.enum';
import { UserSigner } from '@multiversx/sdk-wallet/out';
import { TransactionsHelper } from '@mvx-monorepo/common/contracts/transactions.helper';
import { Locker } from '@multiversx/sdk-nestjs-common';
import { ApiNetworkProvider } from '@multiversx/sdk-network-providers/out';
import { CONSTANTS } from '@mvx-monorepo/common/utils/constants.enum';
import { WegldSwapContract } from '@mvx-monorepo/common/contracts/wegld-swap.contract';
import { FungibleTokenOfAccountOnNetwork } from '@multiversx/sdk-network-providers/out/tokens';
import BigNumber from 'bignumber.js';
import { GasServiceContract } from '@mvx-monorepo/common/contracts/gas-service.contract';
import { IAddress } from '@multiversx/sdk-network-providers/out/interface';
import { GetOrSetCache } from '@mvx-monorepo/common/decorators/get.or.set.cache';
import { CacheInfo } from '@mvx-monorepo/common';

const EGLD_COLLECT_THRESHOLD = new BigNumber('300000000000000000'); // 0.3 EGLD
const EGLD_REFUND_RESERVE = new BigNumber('100000000000000000'); // 0.1 EGLD

const EGLD_LOW_ERROR_THRESHOLD = new BigNumber('100000000000000000'); // 0.1 EGLD
const WEGLD_CONVERT_THRESHOLD = new BigNumber('200000000000000000'); // 0.2 WEGLD

@Injectable()
export class GasCheckerService {
  private readonly logger: Logger;

  constructor(
    @Inject(ProviderKeys.WALLET_SIGNER) private readonly walletSigner: UserSigner,
    private readonly transactionsHelper: TransactionsHelper,
    private readonly api: ApiNetworkProvider,
    private readonly wegldSwapContract: WegldSwapContract,
    private readonly gasServiceContract: GasServiceContract,
  ) {
    this.logger = new Logger(GasCheckerService.name);
  }

  @Cron(CronExpression.EVERY_HOUR)
  async checkGasServiceAndWallet() {
    await Locker.lock('checkGasServiceAndWallet', async () => {
      await this.checkGasServiceAndWalletRaw();
    });
  }

  async checkGasServiceAndWalletRaw() {
    this.logger.debug('Running checkGasServiceAndWallet cron');

    this.logger.log(`Checking gas service fees with address ${this.gasServiceContract.getContractAddress().bech32()}`);

    // First check gas service fees and collect them if necessary
    try {
      await this.checkGasServiceFees();

      this.logger.log('Checked gas service fees successfully');
    } catch (e) {
      this.logger.error('Error while trying to collect fees...');
      this.logger.error(e);
    }

    this.logger.log(`Checking wallet signer balance with address ${this.walletSigner.getAddress().bech32()}`);

    try {
      await this.checkWalletTokens();

      this.logger.log('Checked wallet signer balance successfully');
    } catch (e) {
      this.logger.error('Error while checking wallet signer balance...');
      this.logger.error(e);
    }
  }

  private async checkGasServiceFees() {
    const tokens = await this.getAccountEgldAndWegld(this.gasServiceContract.getContractAddress());
    const tokensToCollect = Object.values(tokens)
      .filter((token) => token.balance.gte(EGLD_COLLECT_THRESHOLD))
      .map((token) => {
        // Leave some tokens in the contract in case of refunds
        token.balance = token.balance.minus(EGLD_REFUND_RESERVE);

        return token;
      });

    if (!tokensToCollect.length) {
      this.logger.log('No fees to collect currently');

      return;
    }

    this.logger.log(
      'Trying to collect fees from gas service for: ' +
        tokensToCollect.map((token) => `${token.identifier} - ${token.balance}`),
    );

    const transaction = this.gasServiceContract.collectFees(
      this.walletSigner.getAddress(),
      tokensToCollect.map((token) => token.identifier),
      tokensToCollect.map((token) => token.balance),
    );

    const txHash = await this.transactionsHelper.signAndSendTransactionAndGetNonce(transaction, this.walletSigner);

    const success = await this.transactionsHelper.awaitSuccess(txHash);

    if (!success) {
      throw new Error(`Error while executing transaction ${txHash}`);
    }

    this.logger.log(`Successfully collected fees from gas service with transaction: ${txHash}!`);
  }

  private async checkWalletTokens() {
    const tokens = await this.getAccountEgldAndWegld(this.walletSigner.getAddress());

    if (tokens.wegldToken.balance.gte(WEGLD_CONVERT_THRESHOLD)) {
      this.logger.log(`Trying to convert ${tokens.wegldToken.balance} wegld token to egld for wallet`);

      const wegld = tokens.wegldToken;

      const transaction = this.wegldSwapContract.unwrapEgld(
        wegld.identifier,
        wegld.balance,
        this.walletSigner.getAddress(),
      );

      const txHash = await this.transactionsHelper.signAndSendTransactionAndGetNonce(transaction, this.walletSigner);

      const success = await this.transactionsHelper.awaitSuccess(txHash);

      if (!success) {
        throw new Error(`Error while executing unwrap egld transaction ${txHash}`);
      }

      this.logger.log('Successfully converted wegld token to egld for wallet');

      // Retrieve new EGLD balance
      tokens.egldToken.balance = (await this.api.getAccount(this.walletSigner.getAddress())).balance;
    }

    if (tokens.egldToken.balance.lt(EGLD_LOW_ERROR_THRESHOLD)) {
      this.logger.error('Low balance for signer wallet! Consider manually topping up EGLD!');
    }
  }

  private async getAccountEgldAndWegld(
    address: IAddress,
  ): Promise<{ egldToken: FungibleTokenOfAccountOnNetwork; wegldToken: FungibleTokenOfAccountOnNetwork }> {
    const account = await this.api.getAccount(address);
    const egldToken: FungibleTokenOfAccountOnNetwork = {
      identifier: CONSTANTS.EGLD_IDENTIFIER,
      balance: account.balance,
      rawResponse: {},
    };

    const wegldTokenId = await this.getWegldTokenId();
    let wegldToken: FungibleTokenOfAccountOnNetwork;
    try {
      wegldToken = await this.api.getFungibleTokenOfAccount(address, wegldTokenId);
    } catch (e) {
      this.logger.warn(`Could not get wegld balance for ${address.bech32()}`);

      wegldToken = {
        identifier: wegldTokenId,
        balance: new BigNumber(0),
        rawResponse: {},
      };
    }

    return { egldToken, wegldToken };
  }

  @GetOrSetCache(CacheInfo.WegldTokenId)
  private async getWegldTokenId(): Promise<string> {
    return await this.wegldSwapContract.getWrappedEgldTokenId();
  }
}
