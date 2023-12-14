import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ProviderKeys } from '@mvx-monorepo/common/utils/provider.enum';
import { UserSigner } from '@multiversx/sdk-wallet/out';
import { TransactionsHelper } from '@mvx-monorepo/common/contracts/transactions.helper';
import { ApiConfigService, CacheInfo } from '@mvx-monorepo/common';
import { Locker } from '@multiversx/sdk-nestjs-common';
import { ApiNetworkProvider } from '@multiversx/sdk-network-providers/out';
import { Address } from '@multiversx/sdk-core/out';
import { CONSTANTS } from '@mvx-monorepo/common/utils/constants.enum';
import { GetOrSetCache } from '@mvx-monorepo/common/decorators/get.or.set.cache';
import { WegldSwapContract } from '@mvx-monorepo/common/contracts/wegld-swap.contract';
import { FungibleTokenOfAccountOnNetwork } from '@multiversx/sdk-network-providers/out/tokens';
import BigNumber from 'bignumber.js';
import { GasServiceContract } from '@mvx-monorepo/common/contracts/gas-service.contract';

const EGLD_THRESHOLD = new BigNumber('100_000_000_000_000_000'); // 0.1 EGLD

@Injectable()
export class GasCheckerService {
  private readonly logger: Logger;

  private readonly contractGasService: string;
  private readonly chainId: string;

  constructor(
    @Inject(ProviderKeys.WALLET_SIGNER) private readonly walletSigner: UserSigner,
    private readonly transactionsHelper: TransactionsHelper,
    private readonly api: ApiNetworkProvider,
    private readonly wegldSwapContract: WegldSwapContract,
    private readonly gasServiceContract: GasServiceContract,
    apiConfigService: ApiConfigService,
  ) {
    this.logger = new Logger(GasCheckerService.name);
    this.contractGasService = apiConfigService.getContractGasService();
    this.chainId = apiConfigService.getChainId();
  }

  @Cron(CronExpression.EVERY_30_MINUTES)
  async checkGasServiceAndWallet() {
    await Locker.lock('checkGasServiceAndWallet', async () => {
      this.logger.debug('Running checkGasServiceAndWallet cron');

      const tokens = await this.getGasServiceEgldAndWegld();
      const toClaim = tokens.filter((token) => token.balance.gte(EGLD_THRESHOLD));

      if (toClaim.length) {
        await this.collectFees(toClaim);
      }
    });
  }

  private async getGasServiceEgldAndWegld(): Promise<FungibleTokenOfAccountOnNetwork[]> {
    const address = Address.fromBech32(this.contractGasService);
    const account = await this.api.getAccount(address);

    const tokens: FungibleTokenOfAccountOnNetwork[] = [];

    tokens.push({
      identifier: CONSTANTS.EGLD_IDENTIFIER,
      balance: account.balance,
      rawResponse: {},
    });

    const wegldTokenId = await this.getWegldTokenId();

    const token = await this.api.getFungibleTokenOfAccount(address, wegldTokenId);

    tokens.push(token);

    return tokens;
  }

  @GetOrSetCache(CacheInfo.WegldTokenId)
  private async getWegldTokenId(): Promise<string> {
    return await this.wegldSwapContract.getWrappedEgldTokenId();
  }

  private async collectFees(toClaim: FungibleTokenOfAccountOnNetwork[]) {
    const accountNonce = await this.transactionsHelper.getAccountNonce(this.walletSigner.getAddress());

    const transaction = this.gasServiceContract.collectFees(
      this.walletSigner.getAddress(),
      toClaim.map(token => token.identifier),
      toClaim.map(token => token.balance),
      accountNonce,
      this.chainId,
    );

    await this.transactionsHelper.sendTransactions([transaction]);


  }
}
