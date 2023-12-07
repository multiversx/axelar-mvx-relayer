import { IAddress } from '@multiversx/sdk-core/out';

export interface ContractCallEvent {
  sender: IAddress,
  destination_chain: string,
  destination_contract_address: string,
  data: {
    payload_hash: string,
    payload: Buffer,
  }
}
