import { IAddress } from '@multiversx/sdk-core/out';
import BigNumber from 'bignumber.js';

export interface ContractCallEvent {
  sender: IAddress;
  destinationChain: string;
  destinationAddress: string;
  payloadHash: string;
  payload: Buffer;
}

export interface MessageApprovedEvent {
  commandId: string;
  sourceChain: string;
  messageId: string;
  sourceAddress: string;
  contractAddress: IAddress;
  payloadHash: string;
}

export interface WeightedSigners {
  signers: {
    signer: string, // ed25519 public key
    weight: BigNumber,
  }[],
  threshold: BigNumber,
  nonce: string; // keccak256 hash
}
