import { Inject, Injectable, Logger } from '@nestjs/common';
import { ContractCallEvent, ContractCallEventStatus, MessageApproved } from '@prisma/client';
import BigNumber from 'bignumber.js';
import { ApiConfigService } from '@mvx-monorepo/common/config';
import { ContractCallEventRepository } from '@mvx-monorepo/common/database/repository/contract-call-event.repository';
import { ProviderKeys } from '@mvx-monorepo/common/utils/provider.enum';
import { Client as AxelarGmpApiClient, Components } from '@mvx-monorepo/common/api/entities/axelar.gmp.api';
import { CONSTANTS } from '@mvx-monorepo/common/utils/constants.enum';
import CallEvent = Components.Schemas.CallEvent;
import Event = Components.Schemas.Event;
import PublishEventsResult = Components.Schemas.PublishEventsResult;
import PublishEventErrorResult = Components.Schemas.PublishEventErrorResult;
import PublishEventAcceptedResult = Components.Schemas.PublishEventAcceptedResult;
import { MessageApprovedEvent as MvxMessageApprovedEvent } from '@mvx-monorepo/common/contracts/entities/gateway-events';
import MessageApprovedEvent = Components.Schemas.MessageApprovedEvent;
import MessageExecutedEvent = Components.Schemas.MessageExecutedEvent;

@Injectable()
export class AxelarGmpApi {
  // @ts-ignore
  private readonly axelarContractVotingVerifier: string;
  private readonly logger: Logger;

  constructor(
    @Inject(ProviderKeys.AXELAR_GMP_API_CLIENT) private readonly apiClient: AxelarGmpApiClient,
    private readonly contractCallEventRepository: ContractCallEventRepository,
    apiConfigService: ApiConfigService,
  ) {
    this.axelarContractVotingVerifier = apiConfigService.getAxelarContractVotingVerifier();
    this.logger = new Logger(AxelarGmpApi.name);
  }

  async sendEventCall(contractCallEvent: ContractCallEvent) {
    const callEvent: CallEvent = {
      eventID: contractCallEvent.id,
      message: {
        messageID: contractCallEvent.id,
        sourceChain: contractCallEvent.sourceChain,
        sourceAddress: contractCallEvent.sourceAddress,
        destinationAddress: contractCallEvent.destinationAddress,
        payloadHash: contractCallEvent.payloadHash,
      },
      destinationChain: contractCallEvent.destinationChain,
      payload: contractCallEvent.payload.toString('hex'),
      meta: {
        txID: contractCallEvent.txHash,
        fromAddress: contractCallEvent.sourceAddress,
        finalized: true,
      },
    };

    const events: Event[] = [
      {
        type: 'CALL',
        ...callEvent,
      },
    ];

    this.logger.debug(`Sending contract call event to Amplifier API for verification, id: ${contractCallEvent.id}`);

    try {
      const res = await this.apiClient.post<PublishEventsResult>(
        `/chains/${CONSTANTS.SOURCE_CHAIN_NAME}/events`,
        events,
      );

      for (const result of res.data.results) {
        if (result.status === 'ACCEPTED') {
          const acceptedResult = result as PublishEventAcceptedResult;

          const event = events[acceptedResult.index];

          this.logger.debug(`Successfully verified contract call event ${event.eventID}!`);

          await this.contractCallEventRepository.updateStatus(event.eventID, ContractCallEventStatus.APPROVED);

          continue;
        }

        const errorResult = result as PublishEventErrorResult;

        const event = events[errorResult.index];

        if (!errorResult.retriable) {
          this.logger.error(
            `Verify contract call event ${event.eventID} was not successful. Can NOT be retried, error: ${errorResult.error}`,
            result,
          );

          await this.contractCallEventRepository.updateStatus(event.eventID, ContractCallEventStatus.FAILED);

          continue;
        }

        this.logger.warn(
          `Verify contract call event ${event.eventID} was not successful. Will be retried, error: ${errorResult.error}`,
          result,
        );
      }
    } catch (e) {
      this.logger.error('Could not send event call to Axelar... Will be retried', e);
    }
  }

  // TODO: Improve this
  async sendMessageApproved(event: MvxMessageApprovedEvent, txHash: string) {
    const messageApproved: MessageApprovedEvent = {
      eventID: event.messageId,  // TODO: This is not right
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

    const events: Event[] = [
      {
        type: 'MESSAGE_APPROVED',
        ...messageApproved,
      },
    ];

    const res = await this.apiClient.post<PublishEventsResult>(
      `/chains/${CONSTANTS.SOURCE_CHAIN_NAME}/events`,
      events,
    );

    for (const result of res.data.results) {
      if (result.status !== 'ACCEPTED') {
        throw new Error('Could not send message approved');
      }
    }
  }

  // TODO: Improve this
  async sendMessageExecuted(messageApproved: MessageApproved, txHash: string) {
    const messageExecuted: MessageExecutedEvent = {
      eventID: messageApproved.messageId, // TODO: This is not right
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
      status: 'SUCCESSFUL', // TODO: Handle reverted
    };

    const events: Event[] = [
      {
        type: 'MESSAGE_EXECUTED',
        ...messageExecuted,
      },
    ];

    const res = await this.apiClient.post<PublishEventsResult>(
      `/chains/${CONSTANTS.SOURCE_CHAIN_NAME}/events`,
      events,
    );

    for (const result of res.data.results) {
      if (result.status !== 'ACCEPTED') {
        throw new Error('Could not send message approved');
      }
    }
  }

  async getTasks(chain: string, lastUUid?: string | undefined, limit: number = 10) {
    return await this.apiClient.getTasks({
      chain,
      after: lastUUid,
      limit,
    });
  }

  // TODO: Implement this after the Axelar GMP API Supports it
  verifyVerifierSet(
    // @ts-ignore
    messageId: string,
    // @ts-ignore
    signers: {
      signer: string;
      weight: BigNumber;
    }[],
    // @ts-ignore
    threshold: BigNumber,
    // @ts-ignore
    nonce: string,
  ) {
    this.logger.error('Verify Verifier Set is not implemented yet!');
  }
}
