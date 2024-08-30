import { Injectable, Logger } from '@nestjs/common';
import { NotifierEvent } from '../event-processor/types';
import { GatewayContract } from '@mvx-monorepo/common/contracts/gateway.contract';
import { TransactionEvent } from '@multiversx/sdk-network-providers/out';
import { MessageApprovedStatus } from '@prisma/client';
import { AxelarGmpApi } from '@mvx-monorepo/common/api/axelar.gmp.api';
import { EventIdentifiers, Events } from '@mvx-monorepo/common/utils/event.enum';
import { BinaryUtils } from '@multiversx/sdk-nestjs-common';
import { MessageApprovedRepository } from '@mvx-monorepo/common/database/repository/message-approved.repository';

@Injectable()
export class GatewayProcessor {
  private readonly logger: Logger;

  constructor(
    private readonly gatewayContract: GatewayContract,
    private readonly messageApprovedRepository: MessageApprovedRepository,
    private readonly axelarGmpApi: AxelarGmpApi,
  ) {
    this.logger = new Logger(GatewayProcessor.name);
  }

  async handleEvent(rawEvent: NotifierEvent) {
    const eventName = BinaryUtils.base64Decode(rawEvent.topics[0]);

    if (
      (rawEvent.identifier === EventIdentifiers.CALL_CONTRACT && eventName === Events.CONTRACT_CALL_EVENT) ||
      (rawEvent.identifier === EventIdentifiers.ROTATE_SIGNERS && eventName === Events.SIGNERS_ROTATED_EVENT)
    ) {
      return rawEvent.txHash;
    }

    // TODO: Move these to the cron job since we need the log id when sending these to the Axelar GMP API
    if (rawEvent.identifier === EventIdentifiers.APPROVE_MESSAGES && eventName === Events.MESSAGE_APPROVED_EVENT) {
      await this.handleMessageApprovedEvent(rawEvent);

      return;
    }

    if (rawEvent.identifier === EventIdentifiers.VALIDATE_MESSAGE && eventName === Events.MESSAGE_EXECUTED_EVENT) {
      await this.handleMessageExecutedEvent(rawEvent);

      return;
    }

    return undefined;
  }

  private async handleMessageApprovedEvent(rawEvent: NotifierEvent) {
    // @ts-ignore
    const event = this.gatewayContract.decodeMessageApprovedEvent(TransactionEvent.fromHttpResponse(rawEvent));

    await this.axelarGmpApi.sendMessageApproved(event, rawEvent.txHash);

    this.logger.debug(`Message was approved ${event.commandId}`);
  }

  private async handleMessageExecutedEvent(rawEvent: NotifierEvent) {
    const commandId = this.gatewayContract.decodeMessageExecutedEvent(TransactionEvent.fromHttpResponse(rawEvent));

    const messageApproved = await this.messageApprovedRepository.findByCommandId(commandId);

    if (!messageApproved) {
      return;
    }

    messageApproved.status = MessageApprovedStatus.SUCCESS;
    messageApproved.successTimes = (messageApproved.successTimes || 0) + 1;

    await this.messageApprovedRepository.updateStatusAndSuccessTimes(messageApproved);

    await this.axelarGmpApi.sendMessageExecuted(messageApproved, rawEvent.txHash);

    this.logger.debug(`Successfully executed message with command id ${messageApproved.commandId}`);
  }
}
