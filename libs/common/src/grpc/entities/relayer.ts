/* eslint-disable */
import { Observable } from "rxjs";

export const protobufPackage = "axelar.relayer.v1beta1";

export interface VerifyRequest {
  message: Message | undefined;
}

export interface VerifyResponse {
  message: Message | undefined;
  success: boolean;
}

export interface Message {
  /** the unique identifier with which the message can be looked up on the source chain */
  id: string;
  sourceChain: string;
  sourceAddress: string;
  destinationChain: string;
  destinationAddress: string;
  /** when we have a better idea of the requirement, we can add an additional optional field here to facilitate verification proofs */
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

export interface Relayer {
  verify(request: Observable<VerifyRequest>): Observable<VerifyResponse>;
  getPayload(request: GetPayloadRequest): Promise<GetPayloadResponse>;
  subscribeToApprovals(request: SubscribeToApprovalsRequest): Observable<SubscribeToApprovalsResponse>;
}
