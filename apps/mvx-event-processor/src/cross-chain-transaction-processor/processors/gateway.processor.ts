import { Injectable, Logger } from '@nestjs/common';
import { EventIdentifiers, Events } from '@mvx-monorepo/common/utils/event.enum';
import { ContractCallEventStatus, MessageApprovedStatus } from '@prisma/client';
import { ContractCallEventRepository } from '@mvx-monorepo/common/database/repository/contract-call-event.repository';
import { ITransactionEvent, ITransactionOnNetwork } from '@multiversx/sdk-core/out';
import { CONSTANTS } from '@mvx-monorepo/common/utils/constants.enum';
import { DecodingUtils } from '@mvx-monorepo/common/utils/decoding.utils';
import { GatewayContract } from '@mvx-monorepo/common';
import { Components } from '@mvx-monorepo/common/api/entities/axelar.gmp.api';
import { MessageApprovedRepository } from '@mvx-monorepo/common/database/repository/message-approved.repository';
import CallEvent = Components.Schemas.CallEvent;
import MessageApprovedEvent = Components.Schemas.MessageApprovedEvent;
import Event = Components.Schemas.Event;
import MessageExecutedEvent = Components.Schemas.MessageExecutedEvent;

@Injectable()
export class GatewayProcessor {
  private logger: Logger;

  constructor(
    private readonly gatewayContract: GatewayContract,
    private readonly contractCallEventRepository: ContractCallEventRepository,
    private readonly messageApprovedRepository: MessageApprovedRepository,
  ) {
    this.logger = new Logger(GatewayProcessor.name);
  }

  async handleGatewayEvent(
    rawEvent: ITransactionEvent,
    transaction: ITransactionOnNetwork,
    index: number,
  ): Promise<Event | undefined> {
    const eventName = rawEvent.topics?.[0]?.toString();

    if (rawEvent.identifier === EventIdentifiers.CALL_CONTRACT && eventName === Events.CONTRACT_CALL_EVENT) {
      return this.handleContractCallEvent(rawEvent, transaction.hash, index);
    }

    if (rawEvent.identifier === EventIdentifiers.APPROVE_MESSAGES && eventName === Events.MESSAGE_APPROVED_EVENT) {
      return this.handleMessageApprovedEvent(rawEvent, transaction.hash, index);
    }

    if (rawEvent.identifier === EventIdentifiers.VALIDATE_MESSAGE && eventName === Events.MESSAGE_EXECUTED_EVENT) {
      return await this.handleMessageExecutedEvent(rawEvent, transaction.hash, index);
    }

    if (rawEvent.identifier === EventIdentifiers.ROTATE_SIGNERS && eventName === Events.SIGNERS_ROTATED_EVENT) {
      return this.handleSignersRotatedEvent(rawEvent, transaction.hash, index);
    }

    return undefined;
  }

  private async handleContractCallEvent(
    rawEvent: ITransactionEvent,
    txHash: string,
    index: number,
  ): Promise<Event | undefined> {
    const contractCallEvent = this.gatewayContract.decodeContractCallEvent(rawEvent);

    // TODO: Remove this?
    const contractCallEventDb = await this.contractCallEventRepository.create({
      txHash,
      eventIndex: index,
      status: ContractCallEventStatus.PENDING,
      sourceAddress: contractCallEvent.sender.bech32(),
      sourceChain: CONSTANTS.SOURCE_CHAIN_NAME,
      destinationAddress: contractCallEvent.destinationAddress,
      destinationChain: contractCallEvent.destinationChain,
      payloadHash: contractCallEvent.payloadHash,
      payload: contractCallEvent.payload,
      retry: 0,
    });

    // A duplicate might exist in the database, so we can skip creation in this case
    if (!contractCallEventDb) {
      return undefined;
    }

    const callEvent: CallEvent = {
      eventID: DecodingUtils.getEventId(txHash, index),
      message: {
        messageID: DecodingUtils.getEventId(txHash, index),
        sourceChain: CONSTANTS.SOURCE_CHAIN_NAME,
        sourceAddress: contractCallEvent.sender.bech32(),
        destinationAddress: contractCallEvent.destinationAddress,
        payloadHash: contractCallEvent.payloadHash,
      },
      destinationChain: contractCallEvent.destinationChain,
      payload: contractCallEvent.payload.toString('hex'),
      meta: {
        txID: txHash,
        fromAddress: contractCallEvent.sender.bech32(),
        finalized: true,
      },
    };

    return {
      type: 'CALL',
      ...callEvent,
    };
  }

  private handleMessageApprovedEvent(rawEvent: ITransactionEvent, txHash: string, index: number): Event {
    const event = this.gatewayContract.decodeMessageApprovedEvent(rawEvent);

    const messageApproved: MessageApprovedEvent = {
      eventID: DecodingUtils.getEventId(txHash, index),
      message: {
        messageID: event.messageId,
        sourceChain: event.sourceChain,
        sourceAddress: event.sourceAddress,
        destinationAddress: event.contractAddress.bech32(),
        payloadHash: event.payloadHash,
      },
      cost: {
        amount: '0', // TODO: How to get amount here?
      },
      meta: {
        txID: txHash,
        fromAddress: event.sourceAddress,
        finalized: true,
      },
    };

    return {
      type: 'MESSAGE_APPROVED',
      ...messageApproved,
    };
  }

  private async handleMessageExecutedEvent(
    rawEvent: ITransactionEvent,
    txHash: string,
    index: number,
  ): Promise<Event | undefined> {
    const commandId = this.gatewayContract.decodeMessageExecutedEvent(rawEvent);

    const messageApproved = await this.messageApprovedRepository.findByCommandId(commandId);

    if (!messageApproved) {
      return undefined;
    }

    messageApproved.status = MessageApprovedStatus.SUCCESS;
    messageApproved.successTimes = (messageApproved.successTimes || 0) + 1;

    await this.messageApprovedRepository.updateStatusAndSuccessTimes(messageApproved);

    const messageExecuted: MessageExecutedEvent = {
      eventID: DecodingUtils.getEventId(txHash, index),
      message: {
        messageID: messageApproved.messageId,
        sourceChain: messageApproved.sourceChain,
        sourceAddress: messageApproved.sourceAddress,
        destinationAddress: messageApproved.contractAddress,
        payloadHash: messageApproved.payloadHash,
      },
      cost: {
        amount: '0', // TODO: How to get amount here?
      },
      meta: {
        txID: txHash,
        fromAddress: messageApproved.sourceAddress,
        finalized: true,
      },
      status: 'SUCCESSFUL', // TODO: Handle reverted?
    };

    this.logger.debug(`Successfully executed message with command id ${messageApproved.commandId}`);

    return {
      type: 'MESSAGE_EXECUTED',
      ...messageExecuted,
    };
  }

  // TODO: Properly implement this after the Axelar GMP API supports it
  private handleSignersRotatedEvent(rawEvent: ITransactionEvent, txHash: string, index: number) {
    const weightedSigners = this.gatewayContract.decodeSignersRotatedEvent(rawEvent);

    this.logger.warn(
      `Received Signers Rotated event which is not properly implemented yet. Transaction:  ${txHash}, index: ${index}`,
      weightedSigners,
    );

    return undefined;

    // // The id needs to have `0x` in front of the txHash (hex string)
    // const id = `0x${txHash}-${index}`;
    //
    // // TODO: Test that this works correctly
    // // @ts-ignore
    // const response = await this.axelarGmpApi.verifyVerifierSet(
    //   id,
    //   weightedSigners.signers,
    //   weightedSigners.threshold,
    //   weightedSigners.nonce,
    // );

    // if (response.published) {
    //   return;
    // }
    //
    // this.logger.warn(`Couldn't dispatch verifyWorkerSet ${id} to Amplifier API. Retrying...`);
    //
    // setTimeout(async () => {
    //   const response = await this.axelarGmpApi.verifyVerifierSet(
    //     id,
    //     weightedSigners.signers,
    //     weightedSigners.threshold,
    //     weightedSigners.nonce,
    //   );
    //
    //   if (!response.published) {
    //     this.logger.error(`Couldn't dispatch verifyWorkerSet ${id} to Amplifier API.`);
    //   }
    // }, 60_000);
  }
}
