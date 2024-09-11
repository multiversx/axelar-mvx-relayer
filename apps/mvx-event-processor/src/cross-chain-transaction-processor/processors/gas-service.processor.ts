import { Injectable, Logger } from '@nestjs/common';
import { EventIdentifiers, Events } from '@mvx-monorepo/common/utils/event.enum';
import { GasServiceContract } from '@mvx-monorepo/common/contracts/gas-service.contract';
import { GasAddedEvent, GasPaidForContractCallEvent } from '@mvx-monorepo/common/contracts/entities/gas-service-events';
import { ITransactionEvent } from '@multiversx/sdk-core/out';
import { DecodingUtils } from '@mvx-monorepo/common/utils/decoding.utils';
import { Components } from '@mvx-monorepo/common/api/entities/axelar.gmp.api';
import { ApiConfigService, GatewayContract } from '@mvx-monorepo/common';
import { TransactionOnNetwork } from '@multiversx/sdk-network-providers/out';
import GasRefundedEvent = Components.Schemas.GasRefundedEvent;
import Event = Components.Schemas.Event;
import GasCreditEvent = Components.Schemas.GasCreditEvent;

@Injectable()
export class GasServiceProcessor {
  private readonly contractGateway: string;
  private logger: Logger;

  constructor(
    private readonly gasServiceContract: GasServiceContract,
    private readonly gatewayContract: GatewayContract,
    apiConfigService: ApiConfigService,
  ) {
    this.contractGateway = apiConfigService.getContractGateway();
    this.logger = new Logger(GasServiceProcessor.name);
  }

  handleGasServiceEvent(
    rawEvent: ITransactionEvent,
    transaction: TransactionOnNetwork,
    index: number,
  ): Event | undefined {
    const eventName = rawEvent.topics?.[0]?.toString();

    if (eventName === Events.GAS_PAID_FOR_CONTRACT_CALL_EVENT) {
      const gasEvent = this.gasServiceContract.decodeGasPaidForContractCallEvent(rawEvent);

      const callContractIndex = this.findCorrespondingCallContractEvent(transaction, index, gasEvent);

      if (callContractIndex === -1) {
        this.logger.warn(
          `Received Gas Paid For Contract Call event but could not find corresponding Call Contract event. Transaction: ${transaction.hash}`,
          gasEvent,
        );

        return undefined;
      }

      return this.handleGasPaidEvent(gasEvent, transaction.hash, index, callContractIndex);
    }

    if (eventName === Events.NATIVE_GAS_PAID_FOR_CONTRACT_CALL_EVENT) {
      const gasEvent = this.gasServiceContract.decodeNativeGasPaidForContractCallEvent(rawEvent);

      const callContractIndex = this.findCorrespondingCallContractEvent(transaction, index, gasEvent);

      if (callContractIndex === -1) {
        this.logger.warn(
          `Received Native Gas Paid For Contract Call event but could not find corresponding Call Contract event. Transaction: ${transaction.hash}`,
          gasEvent,
        );

        return undefined;
      }

      return this.handleGasPaidEvent(gasEvent, transaction.hash, index, callContractIndex);
    }

    if (eventName === Events.GAS_ADDED_EVENT) {
      const event = this.gasServiceContract.decodeGasAddedEvent(rawEvent);

      return this.handleGasAddedEvent(event, transaction.sender.bech32(), transaction.hash, index);
    }

    if (eventName === Events.NATIVE_GAS_ADDED_EVENT) {
      const event = this.gasServiceContract.decodeNativeGasAddedEvent(rawEvent);

      return this.handleGasAddedEvent(event, transaction.sender.bech32(), transaction.hash, index);
    }

    if (eventName === Events.REFUNDED_EVENT) {
      const event = this.gasServiceContract.decodeRefundedEvent(rawEvent);

      const gasRefundedEvent: GasRefundedEvent = {
        eventID: DecodingUtils.getEventId(transaction.hash, index),
        messageID: DecodingUtils.getEventId(event.txHash, event.logIndex),
        recipientAddress: event.data.receiver.bech32(),
        refundedAmount: {
          tokenID: event.data.token,
          amount: event.data.amount.toFixed(),
        },
        cost: {
          amount: '0', // TODO: How to calculate cost?
        },
        meta: {
          txID: transaction.hash,
          fromAddress: transaction.sender.bech32(),
          finalized: true,
        },
      };

      return {
        type: 'GAS_REFUNDED',
        ...gasRefundedEvent,
      };
    }

    return undefined;
  }

  private handleGasPaidEvent(
    event: GasPaidForContractCallEvent,
    txHash: string,
    index: number,
    contractCallIndex: number,
  ): Event | undefined {
    const gasCreditEvent: GasCreditEvent = {
      eventID: DecodingUtils.getEventId(txHash, index),
      messageID: DecodingUtils.getEventId(txHash, contractCallIndex),
      refundAddress: event.data.refundAddress.bech32(),
      payment: {
        tokenID: event.data.gasToken,
        amount: event.data.gasFeeAmount.toFixed(),
      },
      meta: {
        txID: txHash,
        fromAddress: event.sender.bech32(),
        finalized: true,
      },
    };

    return {
      type: 'GAS_CREDIT',
      ...gasCreditEvent,
    };
  }

  private handleGasAddedEvent(event: GasAddedEvent, sender: string, txHash: string, index: number): Event | undefined {
    const gasCreditEvent: GasCreditEvent = {
      eventID: DecodingUtils.getEventId(txHash, index),
      messageID: DecodingUtils.getEventId(event.txHash, event.logIndex),
      refundAddress: event.data.refundAddress.bech32(),
      payment: {
        tokenID: event.data.gasToken,
        amount: event.data.gasFeeAmount.toFixed(),
      },
      meta: {
        txID: txHash,
        fromAddress: sender,
        finalized: true,
      },
    };

    return {
      type: 'GAS_CREDIT',
      ...gasCreditEvent,
    };
  }

  private findCorrespondingCallContractEvent(
    transaction: TransactionOnNetwork,
    index: number,
    gasEvent: GasPaidForContractCallEvent,
  ) {
    // Search for the first corresponding callContract event starting from the current gas paid event index
    const foundIndex = transaction.logs.events.slice(index + 1).findIndex((event) => {
      const eventName = event.topics?.[0]?.toString();

      if (
        event.address.bech32() === this.contractGateway &&
        event.identifier === EventIdentifiers.CALL_CONTRACT &&
        eventName === Events.CONTRACT_CALL_EVENT
      ) {
        const contractCallEvent = this.gatewayContract.decodeContractCallEvent(event);

        return (
          gasEvent.sender.bech32() === contractCallEvent.sender.bech32() &&
          gasEvent.destinationChain === contractCallEvent.destinationChain &&
          gasEvent.destinationAddress === contractCallEvent.destinationAddress &&
          gasEvent.data.payloadHash === contractCallEvent.payloadHash
        );
      }

      return false;
    });

    if (foundIndex === -1) {
      return -1;
    }

    return index + 1 + foundIndex;
  }
}
