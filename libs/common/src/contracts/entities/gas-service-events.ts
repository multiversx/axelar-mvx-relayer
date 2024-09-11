import { IAddress } from '@multiversx/sdk-core/out';
import BigNumber from 'bignumber.js';

export interface GasPaidForContractCallEvent {
  sender: IAddress;
  destinationChain: string;
  destinationAddress: string;
  data: {
    payloadHash: string;
    gasToken: string | null; // null if EGLD
    gasFeeAmount: BigNumber;
    refundAddress: IAddress;
  };
}

export interface GasAddedEvent {
  txHash: string,
  logIndex: number,
  data: {
    gasToken: string | null, // null if EGLD
    gasFeeAmount: BigNumber,
    refundAddress: IAddress,
  }
}

export interface RefundedEvent {
  txHash: string,
  logIndex: number,
  data: {
    receiver: IAddress,
    token: string | null, // null if EGLD
    amount: BigNumber,
  }
}
