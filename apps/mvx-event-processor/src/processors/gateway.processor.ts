import { Injectable, Logger } from '@nestjs/common';
import { NotifierEvent } from '../event-processor/types';
import { GatewayContract } from '@mvx-monorepo/common/contracts/gateway.contract';
import { TransactionEvent } from '@multiversx/sdk-network-providers/out';
import { ContractCallEventRepository } from '@mvx-monorepo/common/database/repository/contract-call-event.repository';
import { MessageApprovedStatus, ContractCallEventStatus } from '@prisma/client';
import { GrpcService } from '@mvx-monorepo/common/grpc/grpc.service';
import { ProcessorInterface } from './entities/processor.interface';
import { EventIdentifiers, Events } from '@mvx-monorepo/common/utils/event.enum';
import { BinaryUtils } from '@multiversx/sdk-nestjs-common';
import { MessageApprovedRepository } from '@mvx-monorepo/common/database/repository/message-approved.repository';
import { CONSTANTS } from '@mvx-monorepo/common/utils/constants.enum';

// order/logIndex is unsupported since we can't easily get it in the relayer, so we use 0 by default
// this means that only one cross chain call is supported for now (the first appropriate call found in transaction logs)
const UNSUPPORTED_LOG_INDEX: number = 0;

@Injectable()
export class GatewayProcessor implements ProcessorInterface {
  private readonly logger: Logger;

  constructor(
    private readonly gatewayContract: GatewayContract,
    private readonly contractCallEventRepository: ContractCallEventRepository,
    private readonly messageApprovedRepository: MessageApprovedRepository,
    private readonly grpcService: GrpcService,
  ) {
    this.logger = new Logger(GatewayProcessor.name);
  }

  async handleEvent(rawEvent: NotifierEvent) {
    const eventName = BinaryUtils.base64Decode(rawEvent.topics[0]);

    if (rawEvent.identifier === EventIdentifiers.CALL_CONTRACT && eventName === Events.CONTRACT_CALL_EVENT) {
      await this.handleContractCallEvent(rawEvent);

      return;
    }

    if (rawEvent.identifier === EventIdentifiers.APPROVE_MESSAGES && eventName === Events.MESSAGE_APPROVED_EVENT) {
      await this.handleMessageApprovedEvent(rawEvent);

      return;
    }

    if (
      rawEvent.identifier === EventIdentifiers.ROTATE_SIGNERS &&
      eventName === Events.SIGNERS_ROTATED_EVENT
    ) {
      await this.handleSignersRotatedEvent(rawEvent);
    }

    if (
      rawEvent.identifier === EventIdentifiers.VALIDATE_MESSAGE &&
      eventName === Events.MESSAGE_EXECUTED_EVENT
    ) {
      await this.handleMessageExecutedEvent(rawEvent);

      return;
    }
  }

  private async handleContractCallEvent(rawEvent: NotifierEvent) {
    const event = this.gatewayContract.decodeContractCallEvent(TransactionEvent.fromHttpResponse(rawEvent));

    const id = `${rawEvent.txHash}-${UNSUPPORTED_LOG_INDEX}`;
    const contractCallEvent = await this.contractCallEventRepository.create({
      id,
      txHash: rawEvent.txHash,
      eventIndex: UNSUPPORTED_LOG_INDEX,
      status: ContractCallEventStatus.PENDING,
      sourceAddress: event.sender.bech32(),
      sourceChain: CONSTANTS.SOURCE_CHAIN_NAME,
      destinationAddress: event.destinationAddress,
      destinationChain: event.destinationChain,
      payloadHash: event.payloadHash,
      payload: event.payload,
    });

    // A duplicate might exist in the database, so we can skip creation in this case
    if (!contractCallEvent) {
      return;
    }

    // TODO: Test if this works correctly
    this.grpcService.verify(contractCallEvent).subscribe({
      next: async (response) => {
        if (!response.error) {
          contractCallEvent.status = ContractCallEventStatus.APPROVED;

          await this.contractCallEventRepository.updateStatus(contractCallEvent);

          return;
        }

        this.logger.warn(`Verify contract call event ${id} was not successful. Will be retried.`);
      },
      error: () => {
        this.logger.warn(`Could not verify contract call event ${id}. Will be retried.`);
      },
    });
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

  private async handleSignersRotatedEvent(rawEvent: NotifierEvent) {
    const weightedSigners = this.gatewayContract.decodeSignersRotatedEvent(
      TransactionEvent.fromHttpResponse(rawEvent),
    );

    const id = `${rawEvent.txHash}-${UNSUPPORTED_LOG_INDEX}`;

    // TODO: Test that this works correctly
    const response = await this.grpcService.verifyVerifierSet(
      id,
      weightedSigners.signers,
      weightedSigners.threshold,
      weightedSigners.nonce,
    );

    if (response.published) {
      return;
    }

    this.logger.warn(`Couldn't dispatch verifyWorkerSet ${id} to Amplifier API. Retrying...`);

    setTimeout(async () => {
      const response = await this.grpcService.verifyVerifierSet(
        id,
        weightedSigners.signers,
        weightedSigners.threshold,
        weightedSigners.nonce,
      );

      if (!response.published) {
        this.logger.error(`Couldn't dispatch verifyWorkerSet ${id} to Amplifier API.`);
      }
    }, 60_000);
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
  }
}
