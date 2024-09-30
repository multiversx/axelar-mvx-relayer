import { Module } from '@nestjs/common';
import { GatewayContract } from './gateway.contract';
import { ApiNetworkProvider, ProxyNetworkProvider } from '@multiversx/sdk-network-providers/out';
import { ResultsParser, TransactionWatcher } from '@multiversx/sdk-core/out';
import { ContractLoader } from '@mvx-monorepo/common/contracts/contract.loader';
import { join } from 'path';
import { GasServiceContract } from '@mvx-monorepo/common/contracts/gas-service.contract';
import { ProviderKeys } from '@mvx-monorepo/common/utils/provider.enum';
import { Mnemonic, UserSigner } from '@multiversx/sdk-wallet/out';
import { TransactionsHelper } from '@mvx-monorepo/common/contracts/transactions.helper';
import { WegldSwapContract } from '@mvx-monorepo/common/contracts/wegld-swap.contract';
import { ApiConfigService } from '@mvx-monorepo/common/config';
import { DynamicModuleUtils } from '@mvx-monorepo/common/utils';
import { ItsContract } from '@mvx-monorepo/common/contracts/its.contract';

@Module({
  imports: [DynamicModuleUtils.getCacheModule()],
  providers: [
    {
      provide: ProxyNetworkProvider,
      useFactory: (apiConfigService: ApiConfigService) => {
        return new ProxyNetworkProvider(apiConfigService.getGatewayUrl(), {
          timeout: apiConfigService.getGatewayTimeout(),
          clientName: 'axelar-mvx-relayer',
        });
      },
      inject: [ApiConfigService],
    },
    {
      provide: ApiNetworkProvider,
      useFactory: (apiConfigService: ApiConfigService) => {
        return new ApiNetworkProvider(apiConfigService.getApiUrl(), {
          timeout: apiConfigService.getApiTimeout(),
          clientName: 'axelar-mvx-relayer',
        });
      },
      inject: [ApiConfigService],
    },
    {
      provide: ResultsParser,
      useValue: new ResultsParser(),
    },
    {
      provide: TransactionWatcher,
      useFactory: (api: ApiNetworkProvider) => new TransactionWatcher(api), // use api here not proxy since it returns proper transaction status
      inject: [ApiNetworkProvider],
    },
    {
      provide: GatewayContract,
      useFactory: async (
        apiConfigService: ApiConfigService,
      ) => {
        const contractLoader = new ContractLoader(join(__dirname, '../assets/gateway.abi.json'));

        const smartContract = await contractLoader.getContract(apiConfigService.getContractGateway());
        const abi = await contractLoader.getAbiRegistry();

        return new GatewayContract(smartContract, abi, apiConfigService.getChainId());
      },
      inject: [ApiConfigService],
    },
    {
      provide: GasServiceContract,
      useFactory: async (apiConfigService: ApiConfigService) => {
        const contractLoader = new ContractLoader(join(__dirname, '../assets/gas-service.abi.json'));

        const smartContract = await contractLoader.getContract(apiConfigService.getContractGasService());
        const abi = await contractLoader.getAbiRegistry();

        return new GasServiceContract(smartContract, abi);
      },
      inject: [ApiConfigService],
    },
    {
      provide: ItsContract,
      useFactory: async (apiConfigService: ApiConfigService) => {
        const contractLoader = new ContractLoader(join(__dirname, '../assets/interchain-token-service.abi.json'));

        const smartContract = await contractLoader.getContract(apiConfigService.getContractIts());

        return new ItsContract(smartContract);
      },
      inject: [ApiConfigService],
    },
    {
      provide: WegldSwapContract,
      useFactory: async (
        apiConfigService: ApiConfigService,
        resultsParser: ResultsParser,
        proxy: ProxyNetworkProvider,
      ) => {
        const contractLoader = new ContractLoader(join(__dirname, '../assets/wegld-swap.abi.json'));

        const smartContract = await contractLoader.getContract(apiConfigService.getContractWegldSwap());

        return new WegldSwapContract(smartContract, resultsParser, proxy);
      },
      inject: [ApiConfigService, ResultsParser, ProxyNetworkProvider],
    },
    {
      provide: ProviderKeys.WALLET_SIGNER,
      useFactory: (apiConfigService: ApiConfigService) => {
        const mnemonic = Mnemonic.fromString(apiConfigService.getWalletMnemonic()).deriveKey(0);

        return new UserSigner(mnemonic);
      },
      inject: [ApiConfigService, ResultsParser],
    },
    TransactionsHelper,
  ],
  exports: [
    GatewayContract,
    GasServiceContract,
    ItsContract,
    WegldSwapContract,
    ProviderKeys.WALLET_SIGNER,
    ProxyNetworkProvider,
    ApiNetworkProvider,
    TransactionsHelper,
  ],
})
export class ContractsModule {}
