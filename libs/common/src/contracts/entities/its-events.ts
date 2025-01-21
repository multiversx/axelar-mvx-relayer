import BigNumber from 'bignumber.js';
import { IAddress } from '@multiversx/sdk-core/out';

export interface InterchainTokenDeploymentStartedEvent {
  tokenId: string;
  name: string;
  symbol: string;
  decimals: number;
  minter: Buffer;
  destinationChain: string;
}

export interface InterchainTransferEvent {
  tokenId: string;
  sourceAddress: IAddress;
  dataHash: string;
  destinationChain: string;
  destinationAddress: Buffer;
  amount: BigNumber;
}
