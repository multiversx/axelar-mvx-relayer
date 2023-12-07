import { IAddress } from '@multiversx/sdk-core/out';
import BigNumber from 'bignumber.js';

export interface GasPaidForContractCallEvent {
  sender: IAddress,
  destination_chain: string,
  destination_contract_address: string,
  data: {
    payload_hash: string,
    gas_token: string,
    gas_fee_amount: BigNumber,
    refund_address: IAddress,
  }
}

export interface NativeGasPaidForContractCallEvent {
  sender: IAddress,
  destination_chain: string,
  destination_contract_address: string,
  data: {
    payload_hash: string,
    value: BigNumber,
    refund_address: IAddress,
  }
}

export interface GasAddedEvent {
  tx_hash: string,
  log_index: number,
  data: {
    gas_token: string,
    gas_fee_amount: BigNumber,
    refund_address: IAddress,
  }
}

export interface NativeGasAddedEvent {
  tx_hash: string,
  log_index: number,
  data: {
    value: BigNumber,
    refund_address: IAddress,
  }
}

export interface RefundedEvent {
  tx_hash: string,
  log_index: number,
  data: {
    receiver: IAddress,
    token: string | null,
    amount: BigNumber,
  }
}
