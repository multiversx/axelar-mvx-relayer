import { Injectable, Logger } from '@nestjs/common';
import { EventIdentifiers, Events } from '@mvx-monorepo/common/utils/event.enum';
import { MessageApprovedStatus } from '@prisma/client';
import { ITransactionEvent } from '@multiversx/sdk-core/out';
import { CONSTANTS } from '@mvx-monorepo/common/utils/constants.enum';
import { DecodingUtils } from '@mvx-monorepo/common/utils/decoding.utils';
import { GatewayContract } from '@mvx-monorepo/common';
import { Components } from '@mvx-monorepo/common/api/entities/axelar.gmp.api';
import { MessageApprovedRepository } from '@mvx-monorepo/common/database/repository/message-approved.repository';
import { TransactionOnNetwork } from '@multiversx/sdk-network-providers/out';
import { BinaryUtils } from '@multiversx/sdk-nestjs-common';
import CallEvent = Components.Schemas.CallEvent;
import MessageApprovedEvent = Components.Schemas.MessageApprovedEvent;
import Event = Components.Schemas.Event;
import MessageExecutedEvent = Components.Schemas.MessageExecutedEvent;
import BigNumber from 'bignumber.js';

@Injectable()
export class GatewayProcessor {
  private logger: Logger;

  constructor(
    private readonly gatewayContract: GatewayContract,
    private readonly messageApprovedRepository: MessageApprovedRepository,
  ) {
    this.logger = new Logger(GatewayProcessor.name);
  }

  async handleGatewayEvent(
    rawEvent: ITransactionEvent,
    transaction: TransactionOnNetwork,
    index: number,
    fee: string,
    transactionValue: string,
  ): Promise<Event | undefined> {
    const eventName = rawEvent.topics?.[0]?.toString();

    if (rawEvent.identifier === EventIdentifiers.CALL_CONTRACT && eventName === Events.CONTRACT_CALL_EVENT) {
      return this.handleContractCallEvent(rawEvent, transaction.hash, index);
    }

    if (rawEvent.identifier === EventIdentifiers.APPROVE_MESSAGES && eventName === Events.MESSAGE_APPROVED_EVENT) {
      return this.handleMessageApprovedEvent(rawEvent, transaction.sender.bech32(), transaction.hash, index);
    }

    if (rawEvent.identifier === EventIdentifiers.VALIDATE_MESSAGE && eventName === Events.MESSAGE_EXECUTED_EVENT) {
      return await this.handleMessageExecutedEvent(
        rawEvent,
        transaction.sender.bech32(),
        transaction.hash,
        index,
        fee,
        transactionValue,
      );
    }

    if (rawEvent.identifier === EventIdentifiers.ROTATE_SIGNERS && eventName === Events.SIGNERS_ROTATED_EVENT) {
      return this.handleSignersRotatedEvent(rawEvent, transaction.hash, index);
    }

    return undefined;
  }

  private handleContractCallEvent(rawEvent: ITransactionEvent, txHash: string, index: number): Event | undefined {
    const contractCallEvent = this.gatewayContract.decodeContractCallEvent(rawEvent);

    const callEvent: CallEvent = {
      eventID: DecodingUtils.getEventId(txHash, index),
      message: {
        messageID: DecodingUtils.getEventId(txHash, index),
        sourceChain: CONSTANTS.SOURCE_CHAIN_NAME,
        sourceAddress: contractCallEvent.sender.bech32(),
        destinationAddress: contractCallEvent.destinationAddress,
        payloadHash: BinaryUtils.hexToBase64(contractCallEvent.payloadHash),
      },
      destinationChain: contractCallEvent.destinationChain,
      payload: contractCallEvent.payload.toString('base64'),
      meta: {
        txID: txHash,
        fromAddress: contractCallEvent.sender.bech32(),
        finalized: true,
      },
    };

    this.logger.debug(
      `Successfully handled contract call event from transaction ${txHash}, log index ${index}`,
      callEvent,
    );

    return {
      type: 'CALL',
      ...callEvent,
    };
  }

  private handleMessageApprovedEvent(
    rawEvent: ITransactionEvent,
    sender: string,
    txHash: string,
    index: number,
  ): Event {
    const event = this.gatewayContract.decodeMessageApprovedEvent(rawEvent);

    const messageApproved: MessageApprovedEvent = {
      eventID: DecodingUtils.getEventId(txHash, index),
      message: {
        messageID: event.messageId,
        sourceChain: event.sourceChain,
        sourceAddress: event.sourceAddress,
        destinationAddress: event.contractAddress.bech32(),
        payloadHash: BinaryUtils.hexToBase64(event.payloadHash),
      },
      cost: {
        amount: '0', // This will be set later since multiple approvals can happen in the same transaction
      },
      meta: {
        txID: txHash,
        fromAddress: sender,
        finalized: true,
      },
    };

    this.logger.debug(
      `Successfully handled message approved event from transaction ${txHash}, log index ${index}`,
      messageApproved,
    );

    return {
      type: 'MESSAGE_APPROVED',
      ...messageApproved,
    };
  }

  private async handleMessageExecutedEvent(
    rawEvent: ITransactionEvent,
    sender: string,
    txHash: string,
    index: number,
    fee: string,
    transactionValue: string,
  ): Promise<Event | undefined> {
    const messageExecutedEvent = this.gatewayContract.decodeMessageExecutedEvent(rawEvent);

    const messageApproved = await this.messageApprovedRepository.findBySourceChainAndMessageId(
      messageExecutedEvent.sourceChain,
      messageExecutedEvent.messageId,
    );

    if (messageApproved) {
      messageApproved.status = MessageApprovedStatus.SUCCESS;
      messageApproved.successTimes = (messageApproved.successTimes || 0) + 1;

      await this.messageApprovedRepository.updateStatusAndSuccessTimes(messageApproved);
    } else {
      this.logger.warn(
        `Could not find corresponding message approved for message executed event in database from ${messageExecutedEvent.sourceChain} with message id ${messageExecutedEvent.messageId}`,
      );
    }

    const messageExecuted: MessageExecutedEvent = {
      eventID: DecodingUtils.getEventId(txHash, index),
      messageID: messageExecutedEvent.messageId,
      sourceChain: messageExecutedEvent.sourceChain,
      cost: {
        amount: new BigNumber(fee).plus(transactionValue, 10).toFixed(), // Also add transaction value to fee, i.e in case of ITS execute with ESDT issue cost
      },
      meta: {
        txID: txHash,
        fromAddress: sender,
        finalized: true,
      },
      status: 'SUCCESSFUL', // TODO: How to handle reverted?
    };

    this.logger.debug(
      `Successfully executed message from ${messageExecutedEvent.sourceChain} with message id ${messageExecutedEvent.messageId}`,
    );

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
    //
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
