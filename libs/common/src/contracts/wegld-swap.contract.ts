import { Injectable } from '@nestjs/common';
import { IAddress, ResultsParser, SmartContract, TokenTransfer, Transaction } from '@multiversx/sdk-core/out';
import { GasInfo } from '@mvx-monorepo/common/utils/gas.info';
import BigNumber from 'bignumber.js';
import { ProxyNetworkProvider } from '@multiversx/sdk-network-providers/out';

@Injectable()
export class WegldSwapContract {
  constructor(
    private readonly smartContract: SmartContract,
    private readonly resultsParser: ResultsParser,
    private readonly proxy: ProxyNetworkProvider,
  ) {}

  unwrapEgld(token: string, amount: BigNumber, sender: IAddress, accountNonce: number, chainId: string): Transaction {
    return this.smartContract.methodsExplicit
      .unwrapEgld()
      .withSender(sender)
      .withNonce(accountNonce)
      .withSingleESDTTransfer(TokenTransfer.fungibleFromBigInteger(token, amount))
      .withGasLimit(GasInfo.UnwrapEgld.value)
      .withChainID(chainId)
      .buildTransaction();
  }

  async getWrappedEgldTokenId(): Promise<string> {
    const interaction = this.smartContract.methods.getWrappedEgldTokenId([]);
    const query = interaction.check().buildQuery();
    const response = await this.proxy.queryContract(query);

    const { firstValue: tokenId } = this.resultsParser.parseQueryResponse(response, interaction.getEndpoint());

    return tokenId?.valueOf().toString() ?? '';
  }
}
