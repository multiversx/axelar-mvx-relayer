/* eslint-disable */
import { Observable } from "rxjs";

export const protobufPackage = "";

export interface Message {
  /** the unique identifier with which the message can be looked up on the source chain */
  id: string;
  sourceChain: string;
  sourceAddress: string;
  destinationChain: string;
  destinationAddress: string;
  payload: Uint8Array;
}

export interface GetPayloadRequest {
  hash: Uint8Array;
}

export interface GetPayloadResponse {
  payload: Uint8Array;
}

export interface SubscribeToApprovalsRequest {
  chain: string;
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
  success: boolean;
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
  receipt: Receipt | undefined;
}

export interface Receipt {
  error: string;
  blockHeight: number;
  gasUsed: number;
  gasWanted: number;
  txHash: string;
  txResponseLog: string;
}

export interface Relayer {
  verify(request: Observable<VerifyRequest>): Observable<VerifyResponse>;
  getPayload(request: GetPayloadRequest): Promise<GetPayloadResponse>;
  subscribeToApprovals(request: SubscribeToApprovalsRequest): Observable<SubscribeToApprovalsResponse>;
  subscribeToWasmEvents(request: SubscribeToWasmEventsRequest): Observable<SubscribeToWasmEventsResponse>;
  broadcast(request: BroadcastRequest): Promise<BroadcastResponse>;
}
