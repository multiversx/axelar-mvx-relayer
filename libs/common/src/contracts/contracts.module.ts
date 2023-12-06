import { Module } from '@nestjs/common';
import { GatewayContract } from './gateway.contract';
import { ApiConfigService } from '@mvx-monorepo/common';
import { ApiNetworkProvider, ProxyNetworkProvider } from '@multiversx/sdk-network-providers/out';
import { ResultsParser } from '@multiversx/sdk-core/out';
import { ContractLoader } from '@mvx-monorepo/common/contracts/contract.loader';
import gatewayJson from '../../../../abis/gateway.abi.json';

@Module({
  imports: [],
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
      useFactory: (apiConfigService: ApiConfigService, resultsParser: ResultsParser) => {
        const contractLoader = new ContractLoader(gatewayJson);

        const smartContract = contractLoader.getContract(apiConfigService.getContractGateway());
        const abi = contractLoader.getAbiRegistry(apiConfigService.getContractGateway());

        return new GatewayContract(smartContract, abi, resultsParser);
      },
      inject: [ApiConfigService, ResultsParser],
    },
  ],
  exports: [GatewayContract],
})
export class ContractsModule {}
