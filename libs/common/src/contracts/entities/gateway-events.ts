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
  sourceChain: string;
  messageId: string;
  sourceAddress: string;
  contractAddress: IAddress;
  payloadHash: string;
}

export interface MessageExecutedEvent {
  sourceChain: string;
  messageId: string;
}

export interface SignersRotatedEvent {
  epoch: BigNumber;
  signersHash: string;
  signers: {
    signer: string, // ed25519 public key
    weight: BigNumber,
  }[],
  threshold: BigNumber,
  nonce: string; // uint256 as 32 bytes hex
}
