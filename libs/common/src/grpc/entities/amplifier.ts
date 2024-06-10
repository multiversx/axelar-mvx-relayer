/* eslint-disable */
import { Observable } from "rxjs";

export const protobufPackage = "axelar.amplifier.v1beta1";

export enum ErrorCode {
  VERIFICATION_FAILED = 0,
  INTERNAL_ERROR = 1,
  AXELAR_NETWORK_ERROR = 2,
  INSUFFICIENT_GAS = 3,
  FAILED_ON_CHAIN = 4,
  MESSAGE_NOT_FOUND = 5,
  UNRECOGNIZED = -1,
}

export interface Message {
  /** the unique identifier with which the message can be looked */
  id: string;
  /** up on the source chain */
  sourceChain: string;
  sourceAddress: string;
  destinationChain: string;
  destinationAddress: string;
  /**
   * when we have a better idea of the requirement, we can add an additional
   * optional field here to facilitate verification proofs
   */
  payload: Uint8Array;
}

export interface GetPayloadRequest {
  hash: Uint8Array;
}

export interface GetPayloadResponse {
  payload: Uint8Array;
}

export interface SubscribeToApprovalsRequest {
  chains: string[];
  /** can be used to replay events */
  startHeight?: number | undefined;
}

export interface SubscribeToApprovalsResponse {
  chain: string;
  executeData: Uint8Array;
  blockHeight: number;
}

export interface VerifyRequest {
  message: Message | undefined;
}

export interface VerifyResponse {
  message: Message | undefined;
  error?: Error | undefined;
}

export interface Error {
  error: string;
  errorCode: ErrorCode;
}

export interface SubscribeToWasmEventsRequest {
  startHeight?: number | undefined;
}

export interface SubscribeToWasmEventsResponse {
  type: string;
  attributes: Attribute[];
  height: number;
}

export interface Attribute {
  key: string;
  value: string;
}

export interface BroadcastRequest {
  address: string;
  payload: Uint8Array;
}

export interface BroadcastResponse {
  published: boolean;
  receiptId: string;
}

export interface GetReceiptRequest {
  receiptId: string;
}

export interface GetReceiptResponse {
  txHash: string;
}

export interface Amplifier {
  verify(request: Observable<VerifyRequest>): Observable<VerifyResponse>;
  getPayload(request: GetPayloadRequest): Promise<GetPayloadResponse>;
  subscribeToApprovals(request: SubscribeToApprovalsRequest): Observable<SubscribeToApprovalsResponse>;
  subscribeToWasmEvents(request: SubscribeToWasmEventsRequest): Observable<SubscribeToWasmEventsResponse>;
  broadcast(request: BroadcastRequest): Promise<BroadcastResponse>;
  getReceipt(request: GetReceiptRequest): Promise<GetReceiptResponse>;
}
