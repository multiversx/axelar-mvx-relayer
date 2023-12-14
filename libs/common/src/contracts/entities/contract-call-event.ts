import { IAddress } from '@multiversx/sdk-core/out';

export interface ContractCallEvent {
  sender: IAddress,
  destinationChain: string,
  destinationAddress: string,
  data: {
    payloadHash: string,
    payload: Buffer,
  }
}
