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
    namespace Schemas {
        export type Address = string;
        export type BigInt = string; // ^(0|[1-9]\d*)$
        export interface CallEvent {
            eventID: string;
            meta?: {
                txID?: string | null;
                timestamp?: string; // date-time
                fromAddress?: string | null;
                finalized?: boolean | null;
                parentMessageID?: string | null;
            } | null;
            message: GatewayV2Message;
            destinationChain: string;
            payload: string; // byte
        }
        export interface CallEventMetadata {
            txID?: string | null;
            timestamp?: string; // date-time
            fromAddress?: string | null;
            finalized?: boolean | null;
            parentMessageID?: string | null;
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
        export type CannotExecuteMessageReason = "INSUFFICIENT_GAS" | "ERROR";
        export interface ErrorResponse {
            error: string;
            requestID?: string;
        }
        export type Event = {
            type: EventType;
        } & (GasCreditEvent | GasRefundedEvent | CallEvent | MessageApprovedEvent | MessageExecutedEvent | CannotExecuteMessageEvent);
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
        export type EventType = "GAS_CREDIT" | "GAS_REFUNDED" | "CALL" | "MESSAGE_APPROVED" | "MESSAGE_EXECUTED" | "CANNOT_EXECUTE_MESSAGE";
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
        export type Task = VerifyTask | GatewayTransactionTask | ExecuteTask | RefundTask;
        export interface TaskItem {
            id: string;
            timestamp: string; // date-time
            type: TaskType;
            task: Task;
        }
        export type TaskItemID = string;
        export type TaskType = "VERIFY" | "GATEWAY_TX" | "EXECUTE" | "REFUND";
        export interface Token {
            tokenID?: string | null;
            amount: BigInt /* ^(0|[1-9]\d*)$ */;
        }
        export interface VerifyTask {
            message: GatewayV2Message;
            payload: string; // byte
        }
    }
}
declare namespace Paths {
    namespace Chains$ChainEvents {
        namespace Post {
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
   * getTasks - Poll transaction to be executed on chain
   */
  'getTasks'(
    parameters?: Parameters<Paths.GetTasks.QueryParameters & Paths.GetTasks.PathParameters> | null,
    data?: any,
    config?: AxiosRequestConfig
  ): OperationResponse<Paths.GetTasks.Responses.$200>
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
  ['/chains/{chain}/events']: {
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
}

export type Client = OpenAPIClient<OperationMethods, PathsDictionary>

export type Address = Components.Schemas.Address;
export type BigInt = Components.Schemas.BigInt;
export type CallEvent = Components.Schemas.CallEvent;
export type CallEventMetadata = Components.Schemas.CallEventMetadata;
export type CannotExecuteMessageEvent = Components.Schemas.CannotExecuteMessageEvent;
export type CannotExecuteMessageEventMetadata = Components.Schemas.CannotExecuteMessageEventMetadata;
export type CannotExecuteMessageReason = Components.Schemas.CannotExecuteMessageReason;
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
export type Task = Components.Schemas.Task;
export type TaskItem = Components.Schemas.TaskItem;
export type TaskItemID = Components.Schemas.TaskItemID;
export type TaskType = Components.Schemas.TaskType;
export type Token = Components.Schemas.Token;
export type VerifyTask = Components.Schemas.VerifyTask;
