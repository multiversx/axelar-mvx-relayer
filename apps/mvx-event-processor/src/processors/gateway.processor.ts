import { Injectable, Logger } from '@nestjs/common';
import { NotifierEvent } from '../event-processor/types';
import { GatewayContract } from '@mvx-monorepo/common/contracts/gateway.contract';
import { TransactionEvent } from '@multiversx/sdk-network-providers/out';
import { MessageApprovedStatus } from '@prisma/client';
import { GrpcService } from '@mvx-monorepo/common/grpc/grpc.service';
import { EventIdentifiers, Events } from '@mvx-monorepo/common/utils/event.enum';
import { BinaryUtils } from '@multiversx/sdk-nestjs-common';
import { MessageApprovedRepository } from '@mvx-monorepo/common/database/repository/message-approved.repository';

@Injectable()
export class GatewayProcessor {
  private readonly logger: Logger;

  constructor(
    private readonly gatewayContract: GatewayContract,
    private readonly messageApprovedRepository: MessageApprovedRepository,
    private readonly grpcService: GrpcService,
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
    const event = this.gatewayContract.decodeMessageApprovedEvent(TransactionEvent.fromHttpResponse(rawEvent));

    const payload = await this.grpcService.getPayload(event.payloadHash);

    const messageApproved = await this.messageApprovedRepository.create({
      commandId: event.commandId,
      txHash: rawEvent.txHash,
      status: MessageApprovedStatus.PENDING,
      sourceAddress: event.sourceAddress,
      sourceChain: event.sourceChain,
      messageId: event.messageId,
      contractAddress: event.contractAddress.bech32(),
      payloadHash: event.payloadHash,
      payload,
      retry: 0,
    });

    if (!messageApproved) {
      throw new Error(`Couldn't save contract call approved to database for hash ${rawEvent.txHash}`);
    }
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

    this.logger.debug(`Successfully executed message with command id ${messageApproved.commandId}`);
  }
}
