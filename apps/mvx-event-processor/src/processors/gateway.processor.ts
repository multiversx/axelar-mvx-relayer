import { Injectable } from '@nestjs/common';
import { NotifierEvent } from '../event-processor/types';
import { GatewayContract } from '@mvx-monorepo/common/contracts/gateway.contract';
import { TransactionEvent } from '@multiversx/sdk-network-providers/out';
import { ContractCallEventRepository } from '@mvx-monorepo/common/database/repository/contract-call-event.repository';
import { ApiConfigService } from '@mvx-monorepo/common';
import { ContractCallApprovedStatus, ContractCallEventStatus } from '@prisma/client';
import { GrpcService } from '@mvx-monorepo/common/grpc/grpc.service';
import { ProcessorInterface } from './entities/processor.interface';
import { EventIdentifiers, Events } from '@mvx-monorepo/common/utils/event.enum';
import { BinaryUtils } from '@multiversx/sdk-nestjs-common';
import { ContractCallApprovedRepository } from '@mvx-monorepo/common/database/repository/contract-call-approved.repository';

// order/logIndex is unsupported since we can't easily get it in the relayer
// so we use a sufficiently large u32 value here instead
const UNSUPPORTED_LOG_INDEX: number = 999_999;

@Injectable()
export class GatewayProcessor implements ProcessorInterface {
  private sourceChain: string;

  constructor(
    private readonly gatewayContract: GatewayContract,
    private readonly contractCallEventRepository: ContractCallEventRepository,
    private readonly contractCallApprovedRepository: ContractCallApprovedRepository,
    private readonly grpcService: GrpcService,
    apiConfigService: ApiConfigService,
  ) {
    this.sourceChain = apiConfigService.getSourceChainName();
  }

  async handleEvent(rawEvent: NotifierEvent) {
    const eventName = BinaryUtils.base64Decode(rawEvent.topics[0]);

    if (rawEvent.identifier === EventIdentifiers.CALL_CONTRACT && eventName === Events.CONTRACT_CALL_EVENT) {
      await this.handleContractCallEvent(rawEvent);

      return;
    }

    if (rawEvent.identifier === EventIdentifiers.EXECUTE && eventName === Events.CONTRACT_CALL_APPROVED_EVENT) {
      await this.handleContractCallApprovedEvent(rawEvent);

      return;
    }
  }

  private async handleContractCallEvent(rawEvent: NotifierEvent) {
    const event = this.gatewayContract.decodeContractCallEvent(TransactionEvent.fromHttpResponse(rawEvent));

    const contractCallEvent = await this.contractCallEventRepository.create({
      id: `${this.sourceChain}:${rawEvent.txHash}:${UNSUPPORTED_LOG_INDEX}`,
      txHash: rawEvent.txHash,
      eventIndex: UNSUPPORTED_LOG_INDEX,
      status: ContractCallEventStatus.PENDING,
      sourceAddress: event.sender.bech32(),
      sourceChain: this.sourceChain,
      destinationAddress: event.destinationAddress,
      destinationChain: event.destinationChain,
      payloadHash: event.data.payloadHash,
      payload: event.data.payload,
    });

    if (!contractCallEvent) {
      throw new Error(`Couldn't save contract call event to database for hash ${rawEvent.txHash}`);
    }

    // TODO: Should this be batched instead and have this in a separate cronjob?
    await this.grpcService.verify(contractCallEvent);
    // TODO: We should mark here the message as successfull after sending to grpc
    // Maybe this sending should be async in a cron?
    // For now the ContractCallEvent in db will remain as PENDING if it was not successfully sent to the Relayer API
    // Verify endpoint. After it was sent, it can be marked as APPROVED
    // GasPaid will remain as PENDING status for now
  }

  private async handleContractCallApprovedEvent(rawEvent: NotifierEvent) {
    const event = this.gatewayContract.decodeContractCallApprovedEvent(TransactionEvent.fromHttpResponse(rawEvent));

    const payload = await this.grpcService.getPayload(event.payloadHash);

    const contractCallApproved = await this.contractCallApprovedRepository.create({
      commandId: event.commandId,
      txHash: rawEvent.txHash,
      status: ContractCallApprovedStatus.PENDING,
      sourceAddress: event.sourceAddress,
      sourceChain: event.sourceChain,
      contractAddress: event.contractAddress.bech32(),
      payloadHash: event.payloadHash,
      payload,
      retry: 0,
    });

    if (!contractCallApproved) {
      throw new Error(`Couldn't save contract call approved to database for hash ${rawEvent.txHash}`);
    }
  }
}
