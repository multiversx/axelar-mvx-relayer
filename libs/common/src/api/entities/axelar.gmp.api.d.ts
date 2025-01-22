import type {
  OpenAPIClient,
  Parameters,
  UnknownParamsObject,
  OperationResponse,
  AxiosRequestConfig,
} from 'openapi-client-axios';

declare namespace Components {
    namespace Parameters {
        export type After = string;
        export type BroadcastID = Schemas.BroadcastID;
        export type Chain = string;
        export type Limit = number;
        export type WasmContractAddress = string; // ^axelar1[acdefghjklmnpqrstuvwxyz023456789]{58}$
    }
    export interface PathParameters {
        chain: Parameters.Chain;
        wasmContractAddress: Parameters.WasmContractAddress /* ^axelar1[acdefghjklmnpqrstuvwxyz023456789]{58}$ */;
        broadcastID: Parameters.BroadcastID;
    }
    export interface QueryParameters {
        after?: Parameters.After;
        limit?: Parameters.Limit;
    }
    namespace Schemas {
        export type Address = string;
        export type BigInt = string; // ^(0|[1-9]\d*)$
        export type BroadcastID = string;
        export interface BroadcastRequest {
            [name: string]: any;
        }
        export interface BroadcastResponse {
            broadcastID: BroadcastID;
        }
        export type BroadcastStatus = "RECEIVED" | "SUCCESS" | "ERROR";
        export interface BroadcastStatusResponse {
            status: BroadcastStatus;
            receivedAt: string; // date-time
            completedAt?: string; // date-time
            txEvents?: BroadcastTxEvent[];
            txHash?: string | null;
            error?: string | null;
        }
        export interface BroadcastTxEvent {
            type: string;
            attributes: BroadcastTxEventAttribute[];
        }
        export interface BroadcastTxEventAttribute {
            key: string;
            value: string;
        }
        export interface CallEvent {
            eventID: string;
            meta?: {
                txID?: string | null;
                timestamp?: string; // date-time
                fromAddress?: string | null;
                finalized?: boolean | null;
                parentMessageID?: string | null;
                parentSourceChain?: string | null;
            } | null;
            message: GatewayV2Message;
            destinationChain: string;
            payload: string; // byte
            withToken?: Token;
        }
        export interface CallEventMetadata {
            txID?: string | null;
            timestamp?: string; // date-time
            fromAddress?: string | null;
            finalized?: boolean | null;
            parentMessageID?: string | null;
            parentSourceChain?: string | null;
        }
        export interface CannotExecuteMessageEvent {
            eventID: string;
            meta?: {
                txID?: string | null;
                timestamp?: string; // date-time
                fromAddress?: string | null;
                finalized?: boolean | null;
            } | null;
            taskItemID: TaskItemID;
            reason: CannotExecuteMessageReason;
            details: string;
        }
        export interface CannotExecuteMessageEventMetadata {
            fromAddress?: string | null;
            timestamp?: string; // date-time
        }
        export interface CannotExecuteMessageEventV2 {
            eventID: string;
            meta?: {
                txID?: string | null;
                timestamp?: string; // date-time
                fromAddress?: string | null;
                finalized?: boolean | null;
                taskItemID?: TaskItemID;
            } | null;
            messageID: string;
            sourceChain: string;
            reason: CannotExecuteMessageReason;
            details: string;
        }
        export interface CannotExecuteMessageEventV2Metadata {
            fromAddress?: string | null;
            timestamp?: string; // date-time
            taskItemID?: TaskItemID;
        }
        export type CannotExecuteMessageReason = "INSUFFICIENT_GAS" | "ERROR";
        export interface ConstructProofTask {
            message: GatewayV2Message;
            payload: string; // byte
        }
        export interface ErrorResponse {
            error: string;
            requestID?: string;
        }
        export type Event = {
            type: EventType;
        } & (GasCreditEvent | GasRefundedEvent | CallEvent | MessageApprovedEvent | MessageExecutedEvent | CannotExecuteMessageEvent | CannotExecuteMessageEventV2 | SignersRotatedEvent | ITSInterchainTokenDeploymentStartedEvent | ITSInterchainTransferEvent | ITSAppInterchainTransferSentEvent | ITSAppInterchainTransferReceivedEvent);
        export interface EventBase {
            eventID: string;
            meta?: {
                txID?: string | null;
                timestamp?: string; // date-time
                fromAddress?: string | null;
                finalized?: boolean | null;
            } | null;
        }
        export interface EventMetadata {
            txID?: string | null;
            timestamp?: string; // date-time
            fromAddress?: string | null;
            finalized?: boolean | null;
        }
        export type EventType = "GAS_CREDIT" | "GAS_REFUNDED" | "CALL" | "MESSAGE_APPROVED" | "MESSAGE_EXECUTED" | "CANNOT_EXECUTE_MESSAGE" | "CANNOT_EXECUTE_MESSAGE/V2" | "SIGNERS_ROTATED" | "ITS/INTERCHAIN_TOKEN_DEPLOYMENT_STARTED" | "ITS/INTERCHAIN_TRANSFER" | "ITS_APP/INTERCHAIN_TRANSFER_SENT" | "ITS_APP/INTERCHAIN_TRANSFER_RECEIVED";
        export interface ExecuteTask {
            message: GatewayV2Message;
            payload: string; // byte
            availableGasBalance: Token;
        }
        export interface GasCreditEvent {
            eventID: string;
            meta?: {
                txID?: string | null;
                timestamp?: string; // date-time
                fromAddress?: string | null;
                finalized?: boolean | null;
            } | null;
            messageID: string;
            refundAddress: Address;
            payment: Token;
        }
        export interface GasRefundedEvent {
            eventID: string;
            meta?: {
                txID?: string | null;
                timestamp?: string; // date-time
                fromAddress?: string | null;
                finalized?: boolean | null;
            } | null;
            messageID: string;
            recipientAddress: Address;
            refundedAmount: Token;
            cost: Token;
        }
        export interface GatewayTransactionTask {
            executeData: string; // byte
        }
        export interface GatewayV2Message {
            messageID: string;
            sourceChain: string;
            sourceAddress: Address;
            destinationAddress: Address;
            payloadHash: string; // byte
        }
        export interface GetTasksResult {
            tasks: TaskItem[];
        }
        export interface ITSAppEventMetadata {
            txID?: string | null;
            timestamp?: string; // date-time
            fromAddress?: string | null;
            finalized?: boolean | null;
            emittedByAddress?: string | null;
        }
        export interface ITSAppInterchainTransferReceivedEvent {
            eventID: string;
            meta?: {
                txID?: string | null;
                timestamp?: string; // date-time
                fromAddress?: string | null;
                finalized?: boolean | null;
                emittedByAddress?: string | null;
            } | null;
            messageID: string;
            sourceChain: string;
            sourceAddress: Address;
            sender: string; // byte
            recipient: Address;
            tokenReceived: InterchainTransferToken;
        }
        export interface ITSAppInterchainTransferSentEvent {
            eventID: string;
            meta?: {
                txID?: string | null;
                timestamp?: string; // date-time
                fromAddress?: string | null;
                finalized?: boolean | null;
                emittedByAddress?: string | null;
            } | null;
            messageID: string;
            destinationChain: string;
            destinationContractAddress: Address;
            sender: Address;
            recipient: string; // byte
            tokenSpent: InterchainTransferToken;
        }
        export interface ITSInterchainTokenDeploymentStartedEvent {
            eventID: string;
            meta?: {
                txID?: string | null;
                timestamp?: string; // date-time
                fromAddress?: string | null;
                finalized?: boolean | null;
            } | null;
            messageID: string;
            destinationChain: string;
            token: InterchainTokenDefinition;
        }
        export interface ITSInterchainTransferEvent {
            eventID: string;
            meta?: {
                txID?: string | null;
                timestamp?: string; // date-time
                fromAddress?: string | null;
                finalized?: boolean | null;
            } | null;
            messageID: string;
            destinationChain: string;
            tokenSpent: Token;
            sourceAddress: Address;
            destinationAddress: string; // byte
            dataHash: string; // byte
        }
        export interface InterchainTokenDefinition {
            id: string;
            name: string;
            symbol: string;
            decimals: number; // uint8
        }
        export interface InterchainTransferToken {
            tokenAddress: Address;
            amount: BigInt /* ^(0|[1-9]\d*)$ */;
        }
        export type Keccak256Hash = string; // ^0x[0-9a-f]{64}$
        export interface MessageApprovedEvent {
            eventID: string;
            meta?: {
                txID?: string | null;
                timestamp?: string; // date-time
                fromAddress?: string | null;
                finalized?: boolean | null;
                commandID?: string | null;
            } | null;
            message: GatewayV2Message;
            cost: Token;
        }
        export interface MessageApprovedEventMetadata {
            txID?: string | null;
            timestamp?: string; // date-time
            fromAddress?: string | null;
            finalized?: boolean | null;
            commandID?: string | null;
        }
        export interface MessageExecutedEvent {
            eventID: string;
            meta?: {
                txID?: string | null;
                timestamp?: string; // date-time
                fromAddress?: string | null;
                finalized?: boolean | null;
                commandID?: string | null;
                childMessageIDs?: string[] | null;
                revertReason?: string | null;
            } | null;
            messageID: string;
            sourceChain: string;
            status: MessageExecutionStatus;
            cost: Token;
        }
        export interface MessageExecutedEventMetadata {
            txID?: string | null;
            timestamp?: string; // date-time
            fromAddress?: string | null;
            finalized?: boolean | null;
            commandID?: string | null;
            childMessageIDs?: string[] | null;
            revertReason?: string | null;
        }
        export type MessageExecutionStatus = "SUCCESSFUL" | "REVERTED";
        export interface PublishEventAcceptedResult {
            status: PublishEventStatus;
            index: number;
        }
        export interface PublishEventErrorResult {
            status: PublishEventStatus;
            index: number;
            error: string;
            retriable: boolean;
        }
        export type PublishEventResultItem = PublishEventAcceptedResult | PublishEventErrorResult;
        export interface PublishEventResultItemBase {
            status: PublishEventStatus;
            index: number;
        }
        export type PublishEventStatus = "ACCEPTED" | "ERROR";
        export interface PublishEventsRequest {
            events: [
                Event,
                Event?,
                Event?,
                Event?,
                Event?,
                Event?,
                Event?,
                Event?,
                Event?,
                Event?,
                Event?,
                Event?,
                Event?,
                Event?,
                Event?,
                Event?,
                Event?,
                Event?,
                Event?,
                Event?,
                Event?,
                Event?,
                Event?,
                Event?,
                Event?,
                Event?,
                Event?,
                Event?,
                Event?,
                Event?,
                Event?,
                Event?,
                Event?,
                Event?,
                Event?,
                Event?,
                Event?,
                Event?,
                Event?,
                Event?,
                Event?,
                Event?,
                Event?,
                Event?,
                Event?,
                Event?,
                Event?,
                Event?,
                Event?,
                Event?,
                Event?,
                Event?,
                Event?,
                Event?,
                Event?,
                Event?,
                Event?,
                Event?,
                Event?,
                Event?,
                Event?,
                Event?,
                Event?,
                Event?,
                Event?,
                Event?,
                Event?,
                Event?,
                Event?,
                Event?,
                Event?,
                Event?,
                Event?,
                Event?,
                Event?,
                Event?,
                Event?,
                Event?,
                Event?,
                Event?,
                Event?,
                Event?,
                Event?,
                Event?,
                Event?,
                Event?,
                Event?,
                Event?,
                Event?,
                Event?,
                Event?,
                Event?,
                Event?,
                Event?,
                Event?,
                Event?,
                Event?,
                Event?,
                Event?,
                Event?
            ];
        }
        export interface PublishEventsResult {
            results: PublishEventResultItem[];
        }
        export interface RefundTask {
            message: GatewayV2Message;
            refundRecipientAddress: Address;
            remainingGasBalance: Token;
        }
        export interface SignersRotatedEvent {
            eventID: string;
            meta?: {
                txID?: string | null;
                timestamp?: string; // date-time
                fromAddress?: string | null;
                finalized?: boolean | null;
                signersHash?: string; // byte
                epoch?: number; // int64
            } | null;
            messageID: string;
        }
        export interface SignersRotatedEventMetadata {
            txID?: string | null;
            timestamp?: string; // date-time
            fromAddress?: string | null;
            finalized?: boolean | null;
            signersHash?: string; // byte
            epoch?: number; // int64
        }
        export interface StorePayloadResult {
            keccak256: Keccak256Hash /* ^0x[0-9a-f]{64}$ */;
        }
        export type Task = ConstructProofTask | GatewayTransactionTask | ExecuteTask | RefundTask | VerifyTask;
        export interface TaskItem {
            id: string;
            chain: string;
            timestamp: string; // date-time
            type: TaskType;
            task: Task;
        }
        export type TaskItemID = string;
        export type TaskType = "CONSTRUCT_PROOF" | "EXECUTE" | "GATEWAY_TX" | "REFUND" | "VERIFY";
        export interface Token {
            tokenID?: string | null;
            amount: BigInt /* ^(0|[1-9]\d*)$ */;
        }
        export interface VerifyTask {
            message: GatewayV2Message;
            destinationChain: string;
            payload: string; // byte
        }
    }
}
declare namespace Paths {
    namespace BroadcastMsgExecuteContract {
        namespace Parameters {
            export type WasmContractAddress = string; // ^axelar1[acdefghjklmnpqrstuvwxyz023456789]{58}$
        }
        export interface PathParameters {
            wasmContractAddress: Parameters.WasmContractAddress /* ^axelar1[acdefghjklmnpqrstuvwxyz023456789]{58}$ */;
        }
        export type RequestBody = Components.Schemas.BroadcastRequest;
        namespace Responses {
            export type $200 = Components.Schemas.BroadcastResponse;
            export type $400 = Components.Schemas.ErrorResponse;
            export type $500 = Components.Schemas.ErrorResponse;
        }
    }
    namespace GetMsgExecuteContractBroadcastStatus {
        namespace Parameters {
            export type BroadcastID = Components.Schemas.BroadcastID;
            export type WasmContractAddress = string; // ^axelar1[acdefghjklmnpqrstuvwxyz023456789]{58}$
        }
        export interface PathParameters {
            wasmContractAddress: Parameters.WasmContractAddress /* ^axelar1[acdefghjklmnpqrstuvwxyz023456789]{58}$ */;
            broadcastID: Parameters.BroadcastID;
        }
        namespace Responses {
            export type $200 = Components.Schemas.BroadcastStatusResponse;
            export type $404 = Components.Schemas.ErrorResponse;
            export type $500 = Components.Schemas.ErrorResponse;
        }
    }
    namespace GetPayload {
        namespace Parameters {
            export type Hash = Components.Schemas.Keccak256Hash /* ^0x[0-9a-f]{64}$ */;
        }
        export interface PathParameters {
            hash: Parameters.Hash;
        }
        namespace Responses {
            export type $200 = string; // binary
            export type $404 = Components.Schemas.ErrorResponse;
            export type $500 = Components.Schemas.ErrorResponse;
        }
    }
    namespace GetTasks {
        namespace Parameters {
            export type After = string;
            export type Chain = string;
            export type Limit = number;
        }
        export interface PathParameters {
            chain: Parameters.Chain;
        }
        export interface QueryParameters {
            after?: Parameters.After;
            limit?: Parameters.Limit;
        }
        namespace Responses {
            export type $200 = Components.Schemas.GetTasksResult;
            export type $404 = Components.Schemas.ErrorResponse;
            export type $500 = Components.Schemas.ErrorResponse;
        }
    }
    namespace HealthCheck {
        namespace Responses {
            export interface $200 {
            }
        }
    }
    namespace PublishEvents {
        namespace Parameters {
            export type Chain = string;
        }
        export interface PathParameters {
            chain: Parameters.Chain;
        }
        export type RequestBody = Components.Schemas.PublishEventsRequest;
        namespace Responses {
            export type $200 = Components.Schemas.PublishEventsResult;
            export type $400 = Components.Schemas.ErrorResponse;
            export type $404 = Components.Schemas.ErrorResponse;
            export type $500 = Components.Schemas.ErrorResponse;
        }
    }
    namespace StorePayload {
        export type RequestBody = string; // binary
        namespace Responses {
            export type $200 = Components.Schemas.StorePayloadResult;
            export type $400 = Components.Schemas.ErrorResponse;
            export type $500 = Components.Schemas.ErrorResponse;
        }
    }
}

export interface OperationMethods {
  /**
   * healthCheck - Health check
   */
  'healthCheck'(
    parameters?: Parameters<UnknownParamsObject> | null,
    data?: any,
    config?: AxiosRequestConfig  
  ): OperationResponse<Paths.HealthCheck.Responses.$200>
  /**
   * broadcastMsgExecuteContract - Broadcast arbitrary MsgExecuteContract transaction
   */
  'broadcastMsgExecuteContract'(
    parameters?: Parameters<Paths.BroadcastMsgExecuteContract.PathParameters> | null,
    data?: Paths.BroadcastMsgExecuteContract.RequestBody,
    config?: AxiosRequestConfig  
  ): OperationResponse<Paths.BroadcastMsgExecuteContract.Responses.$200>
  /**
   * getMsgExecuteContractBroadcastStatus - Get broadcast status
   */
  'getMsgExecuteContractBroadcastStatus'(
    parameters?: Parameters<Paths.GetMsgExecuteContractBroadcastStatus.PathParameters> | null,
    data?: any,
    config?: AxiosRequestConfig  
  ): OperationResponse<Paths.GetMsgExecuteContractBroadcastStatus.Responses.$200>
  /**
   * publishEvents - Publish on-chain events
   */
  'publishEvents'(
    parameters?: Parameters<Paths.PublishEvents.PathParameters> | null,
    data?: Paths.PublishEvents.RequestBody,
    config?: AxiosRequestConfig  
  ): OperationResponse<Paths.PublishEvents.Responses.$200>
  /**
   * getTasks - Poll transaction to be executed on chain
   */
  'getTasks'(
    parameters?: Parameters<Paths.GetTasks.QueryParameters & Paths.GetTasks.PathParameters> | null,
    data?: any,
    config?: AxiosRequestConfig  
  ): OperationResponse<Paths.GetTasks.Responses.$200>
  /**
   * storePayload - Temporarily store a large payload against its hash to bypass size restrictions on some chains.
   */
  'storePayload'(
    parameters?: Parameters<UnknownParamsObject> | null,
    data?: Paths.StorePayload.RequestBody,
    config?: AxiosRequestConfig  
  ): OperationResponse<Paths.StorePayload.Responses.$200>
  /**
   * getPayload - Retrieve a stored payload by its hash
   */
  'getPayload'(
    parameters?: Parameters<Paths.GetPayload.PathParameters> | null,
    data?: any,
    config?: AxiosRequestConfig  
  ): OperationResponse<Paths.GetPayload.Responses.$200>
}

export interface PathsDictionary {
  ['/health']: {
    /**
     * healthCheck - Health check
     */
    'get'(
      parameters?: Parameters<UnknownParamsObject> | null,
      data?: any,
      config?: AxiosRequestConfig  
    ): OperationResponse<Paths.HealthCheck.Responses.$200>
  }
  ['/contracts/{wasmContractAddress}/broadcasts']: {
    /**
     * broadcastMsgExecuteContract - Broadcast arbitrary MsgExecuteContract transaction
     */
    'post'(
      parameters?: Parameters<Paths.BroadcastMsgExecuteContract.PathParameters> | null,
      data?: Paths.BroadcastMsgExecuteContract.RequestBody,
      config?: AxiosRequestConfig  
    ): OperationResponse<Paths.BroadcastMsgExecuteContract.Responses.$200>
  }
  ['/contracts/{wasmContractAddress}/broadcasts/{broadcastID}']: {
    /**
     * getMsgExecuteContractBroadcastStatus - Get broadcast status
     */
    'get'(
      parameters?: Parameters<Paths.GetMsgExecuteContractBroadcastStatus.PathParameters> | null,
      data?: any,
      config?: AxiosRequestConfig  
    ): OperationResponse<Paths.GetMsgExecuteContractBroadcastStatus.Responses.$200>
  }
  ['/chains/{chain}/events']: {
    /**
     * publishEvents - Publish on-chain events
     */
    'post'(
      parameters?: Parameters<Paths.PublishEvents.PathParameters> | null,
      data?: Paths.PublishEvents.RequestBody,
      config?: AxiosRequestConfig  
    ): OperationResponse<Paths.PublishEvents.Responses.$200>
  }
  ['/chains/{chain}/tasks']: {
    /**
     * getTasks - Poll transaction to be executed on chain
     */
    'get'(
      parameters?: Parameters<Paths.GetTasks.QueryParameters & Paths.GetTasks.PathParameters> | null,
      data?: any,
      config?: AxiosRequestConfig  
    ): OperationResponse<Paths.GetTasks.Responses.$200>
  }
  ['/payloads']: {
    /**
     * storePayload - Temporarily store a large payload against its hash to bypass size restrictions on some chains.
     */
    'post'(
      parameters?: Parameters<UnknownParamsObject> | null,
      data?: Paths.StorePayload.RequestBody,
      config?: AxiosRequestConfig  
    ): OperationResponse<Paths.StorePayload.Responses.$200>
  }
  ['/payloads/{hash}']: {
    /**
     * getPayload - Retrieve a stored payload by its hash
     */
    'get'(
      parameters?: Parameters<Paths.GetPayload.PathParameters> | null,
      data?: any,
      config?: AxiosRequestConfig  
    ): OperationResponse<Paths.GetPayload.Responses.$200>
  }
}

export type Client = OpenAPIClient<OperationMethods, PathsDictionary>

export type Address = Components.Schemas.Address;
export type BigInt = Components.Schemas.BigInt;
export type BroadcastID = Components.Schemas.BroadcastID;
export type BroadcastRequest = Components.Schemas.BroadcastRequest;
export type BroadcastResponse = Components.Schemas.BroadcastResponse;
export type BroadcastStatus = Components.Schemas.BroadcastStatus;
export type BroadcastStatusResponse = Components.Schemas.BroadcastStatusResponse;
export type BroadcastTxEvent = Components.Schemas.BroadcastTxEvent;
export type BroadcastTxEventAttribute = Components.Schemas.BroadcastTxEventAttribute;
export type CallEvent = Components.Schemas.CallEvent;
export type CallEventMetadata = Components.Schemas.CallEventMetadata;
export type CannotExecuteMessageEvent = Components.Schemas.CannotExecuteMessageEvent;
export type CannotExecuteMessageEventMetadata = Components.Schemas.CannotExecuteMessageEventMetadata;
export type CannotExecuteMessageEventV2 = Components.Schemas.CannotExecuteMessageEventV2;
export type CannotExecuteMessageEventV2Metadata = Components.Schemas.CannotExecuteMessageEventV2Metadata;
export type CannotExecuteMessageReason = Components.Schemas.CannotExecuteMessageReason;
export type ConstructProofTask = Components.Schemas.ConstructProofTask;
export type ErrorResponse = Components.Schemas.ErrorResponse;
export type Event = Components.Schemas.Event;
export type EventBase = Components.Schemas.EventBase;
export type EventMetadata = Components.Schemas.EventMetadata;
export type EventType = Components.Schemas.EventType;
export type ExecuteTask = Components.Schemas.ExecuteTask;
export type GasCreditEvent = Components.Schemas.GasCreditEvent;
export type GasRefundedEvent = Components.Schemas.GasRefundedEvent;
export type GatewayTransactionTask = Components.Schemas.GatewayTransactionTask;
export type GatewayV2Message = Components.Schemas.GatewayV2Message;
export type GetTasksResult = Components.Schemas.GetTasksResult;
export type ITSAppEventMetadata = Components.Schemas.ITSAppEventMetadata;
export type ITSAppInterchainTransferReceivedEvent = Components.Schemas.ITSAppInterchainTransferReceivedEvent;
export type ITSAppInterchainTransferSentEvent = Components.Schemas.ITSAppInterchainTransferSentEvent;
export type ITSInterchainTokenDeploymentStartedEvent = Components.Schemas.ITSInterchainTokenDeploymentStartedEvent;
export type ITSInterchainTransferEvent = Components.Schemas.ITSInterchainTransferEvent;
export type InterchainTokenDefinition = Components.Schemas.InterchainTokenDefinition;
export type InterchainTransferToken = Components.Schemas.InterchainTransferToken;
export type Keccak256Hash = Components.Schemas.Keccak256Hash;
export type MessageApprovedEvent = Components.Schemas.MessageApprovedEvent;
export type MessageApprovedEventMetadata = Components.Schemas.MessageApprovedEventMetadata;
export type MessageExecutedEvent = Components.Schemas.MessageExecutedEvent;
export type MessageExecutedEventMetadata = Components.Schemas.MessageExecutedEventMetadata;
export type MessageExecutionStatus = Components.Schemas.MessageExecutionStatus;
export type PublishEventAcceptedResult = Components.Schemas.PublishEventAcceptedResult;
export type PublishEventErrorResult = Components.Schemas.PublishEventErrorResult;
export type PublishEventResultItem = Components.Schemas.PublishEventResultItem;
export type PublishEventResultItemBase = Components.Schemas.PublishEventResultItemBase;
export type PublishEventStatus = Components.Schemas.PublishEventStatus;
export type PublishEventsRequest = Components.Schemas.PublishEventsRequest;
export type PublishEventsResult = Components.Schemas.PublishEventsResult;
export type RefundTask = Components.Schemas.RefundTask;
export type SignersRotatedEvent = Components.Schemas.SignersRotatedEvent;
export type SignersRotatedEventMetadata = Components.Schemas.SignersRotatedEventMetadata;
export type StorePayloadResult = Components.Schemas.StorePayloadResult;
export type Task = Components.Schemas.Task;
export type TaskItem = Components.Schemas.TaskItem;
export type TaskItemID = Components.Schemas.TaskItemID;
export type TaskType = Components.Schemas.TaskType;
export type Token = Components.Schemas.Token;
export type VerifyTask = Components.Schemas.VerifyTask;
