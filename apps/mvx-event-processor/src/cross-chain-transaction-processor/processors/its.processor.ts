import { Injectable, Logger } from '@nestjs/common';
import { Events } from '@mvx-monorepo/common/utils/event.enum';
import { ITransactionEvent } from '@multiversx/sdk-core/out';
import { DecodingUtils } from '@mvx-monorepo/common/utils/decoding.utils';
import { Components } from '@mvx-monorepo/common/api/entities/axelar.gmp.api';
import { TransactionOnNetwork } from '@multiversx/sdk-network-providers/out';
import { ItsContract } from '@mvx-monorepo/common/contracts/its.contract';
import Event = Components.Schemas.Event;
import ITSInterchainTransferEvent = Components.Schemas.ITSInterchainTransferEvent;
import ITSInterchainTokenDeploymentStartedEvent = Components.Schemas.ITSInterchainTokenDeploymentStartedEvent;

@Injectable()
export class ItsProcessor {
  private logger: Logger;

  constructor(private readonly itsContract: ItsContract) {
    this.logger = new Logger(ItsProcessor.name);
  }

  handleItsEvent(rawEvent: ITransactionEvent, transaction: TransactionOnNetwork, index: number): Event | undefined {
    const eventName = rawEvent.topics?.[0]?.toString();

    if (eventName === Events.INTERCHAIN_TOKEN_DEPLOYMENT_STARTED_EVENT) {
      return this.handleInterchainTokenDeploymentStartedEvent(
        rawEvent,
        transaction.sender.bech32(),
        transaction.hash,
        index,
      );
    }

    if (eventName === Events.INTERCHAIN_TRANSFER_EVENT) {
      return this.handleInterchainTransferEvent(rawEvent, transaction.sender.bech32(), transaction.hash, index);
    }

    return undefined;
  }

  private handleInterchainTokenDeploymentStartedEvent(
    rawEvent: ITransactionEvent,
    sender: string,
    txHash: string,
    index: number,
  ): Event {
    const interchainTokenDeploymentStartedEvent =
      this.itsContract.decodeInterchainTokenDeploymentStartedEvent(rawEvent);

    const event: ITSInterchainTokenDeploymentStartedEvent = {
      eventID: DecodingUtils.getEventId(txHash, index),
      messageID: DecodingUtils.getEventId(txHash, index - 1), // Contract Call event happens before this event
      destinationChain: interchainTokenDeploymentStartedEvent.destinationChain,
      token: {
        id: `0x${interchainTokenDeploymentStartedEvent.tokenId}`,
        name: interchainTokenDeploymentStartedEvent.name,
        symbol: interchainTokenDeploymentStartedEvent.symbol,
        decimals: interchainTokenDeploymentStartedEvent.decimals,
      },
      meta: {
        txID: txHash,
        fromAddress: sender,
        finalized: true,
      },
    };

    this.logger.debug(
      `Successfully handled interchain token deployment started event from transaction ${txHash}, log index ${index}`,
      event,
    );

    return {
      type: 'ITS/INTERCHAIN_TOKEN_DEPLOYMENT_STARTED',
      ...event,
    };
  }

  private handleInterchainTransferEvent(
    rawEvent: ITransactionEvent,
    sender: string,
    txHash: string,
    index: number,
  ): Event {
    const interchainTransferEvent = this.itsContract.decodeInterchainTransferEvent(rawEvent);

    const event: ITSInterchainTransferEvent = {
      eventID: DecodingUtils.getEventId(txHash, index),
      messageID: DecodingUtils.getEventId(txHash, index - 1), // Contract Call event happens before this event
      destinationChain: interchainTransferEvent.destinationChain,
      tokenSpent: {
        tokenID: `0x${interchainTransferEvent.tokenId}`,
        amount: interchainTransferEvent.amount.toFixed(),
      },
      sourceAddress: interchainTransferEvent.sourceAddress.bech32(),
      destinationAddress: interchainTransferEvent.destinationAddress.toString('base64'),
      dataHash: Buffer.from(interchainTransferEvent.dataHash, 'hex').toString('base64'),
      meta: {
        txID: txHash,
        fromAddress: sender,
        finalized: true,
      },
    };

    this.logger.debug(
      `Successfully handled interchain transfer event from transaction ${txHash}, log index ${index}`,
      event,
    );

    return {
      type: 'ITS/INTERCHAIN_TRANSFER',
      ...event,
    };
  }
}
