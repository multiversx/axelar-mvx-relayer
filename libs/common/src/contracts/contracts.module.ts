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
import { ApiConfigService } from '@mvx-monorepo/common/config';
import { DynamicModuleUtils } from '@mvx-monorepo/common/utils';

@Module({
  imports: [DynamicModuleUtils.getCacheModule()],
  providers: [
    {
      provide: ProxyNetworkProvider,
      useFactory: (apiConfigService: ApiConfigService) => {
        return new ProxyNetworkProvider(apiConfigService.getGatewayUrl(), {
          timeout: apiConfigService.getGatewayTimeout(),
        });
      },
      inject: [ApiConfigService],
    },
    {
      provide: ApiNetworkProvider,
      useFactory: (apiConfigService: ApiConfigService) => {
        return new ApiNetworkProvider(apiConfigService.getApiUrl(), {
          timeout: apiConfigService.getApiTimeout(),
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
    // {
    //   provide: ContractQueryRunner,
    //   useFactory: (api: ApiNetworkProvider) => new ContractQueryRunner(api),
    //   inject: [ApiNetworkProvider],
    // },
    // {
    //   provide: ContractTransactionGenerator,
    //   useFactory: (api: ApiNetworkProvider) => new ContractTransactionGenerator(api),
    //   inject: [ApiNetworkProvider],
    // },
    {
      provide: GatewayContract,
      useFactory: async (apiConfigService: ApiConfigService, resultsParser: ResultsParser) => {
        const contractLoader = new ContractLoader(join(__dirname, '../assets/gateway.abi.json'));

        const smartContract = await contractLoader.getContract(apiConfigService.getContractGateway());
        const abi = await contractLoader.getAbiRegistry(apiConfigService.getContractGateway());

        return new GatewayContract(smartContract, abi, resultsParser);
      },
      inject: [ApiConfigService, ResultsParser],
    },
    {
      provide: GasServiceContract,
      useFactory: async (apiConfigService: ApiConfigService, resultsParser: ResultsParser) => {
        const contractLoader = new ContractLoader(join(__dirname, '../assets/gas-service.abi.json'));

        const smartContract = await contractLoader.getContract(apiConfigService.getContractGasService());
        const abi = await contractLoader.getAbiRegistry(apiConfigService.getContractGasService());

        return new GasServiceContract(smartContract, abi, resultsParser);
      },
      inject: [ApiConfigService, ResultsParser],
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
    ProviderKeys.WALLET_SIGNER,
    ProxyNetworkProvider,
    ApiNetworkProvider,
    TransactionsHelper,
  ],
})
export class ContractsModule {}
