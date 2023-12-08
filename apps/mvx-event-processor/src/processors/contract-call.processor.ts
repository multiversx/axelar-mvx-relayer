import { Injectable } from '@nestjs/common';
import { NotifierEvent } from '../event-processor/types';
import { GatewayContract } from '@mvx-monorepo/common/contracts/gateway.contract';
import { TransactionEvent } from '@multiversx/sdk-network-providers/out';
import { ContractCallEventRepository } from '@mvx-monorepo/common/database/repository/contract-call-event.repository';
import { ApiConfigService } from '@mvx-monorepo/common';
import { ContractCallEventStatus } from '@prisma/client';
import { GrpcService } from '@mvx-monorepo/common/grpc/grpc.service';
import { ProcessorInterface } from './entities/processor.interface';
import { EventIdentifiers, Events } from '@mvx-monorepo/common/utils/event.enum';
import { BinaryUtils } from '@multiversx/sdk-nestjs-common';

@Injectable()
export class ContractCallProcessor implements ProcessorInterface {
  private sourceChain: string;

  constructor(
    private readonly gatewayContract: GatewayContract,
    private readonly contractCallEventRepository: ContractCallEventRepository,
    private readonly grpcService: GrpcService,
    apiConfigService: ApiConfigService,
  ) {
    this.sourceChain = apiConfigService.getSourceChainName();
  }

  async handleEvent(rawEvent: NotifierEvent) {
    if (
      rawEvent.identifier !== EventIdentifiers.CALL_CONTRACT ||
      BinaryUtils.base64Decode(rawEvent.topics[0]) !== Events.CONTRACT_CALL_EVENT
    ) {
      return;
    }

    const event = this.gatewayContract.decodeContractCallEvent(TransactionEvent.fromHttpResponse(rawEvent));

    const contractCallEvent = await this.contractCallEventRepository.create({
      id: `${this.sourceChain}:${rawEvent.txHash}:${rawEvent.order}`,
      txHash: rawEvent.txHash,
      eventIndex: rawEvent.order,
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
}
