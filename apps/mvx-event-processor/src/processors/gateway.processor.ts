import { Injectable, Logger } from '@nestjs/common';
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

// order/logIndex is unsupported since we can't easily get it in the relayer, so we use 0 by default
// this means that only one cross chain call is supported for now (the first appropriate call found in transaction logs)
const UNSUPPORTED_LOG_INDEX: number = 0;

@Injectable()
export class GatewayProcessor implements ProcessorInterface {
  private readonly logger: Logger;
  private readonly sourceChain: string;

  constructor(
    private readonly gatewayContract: GatewayContract,
    private readonly contractCallEventRepository: ContractCallEventRepository,
    private readonly contractCallApprovedRepository: ContractCallApprovedRepository,
    private readonly grpcService: GrpcService,
    apiConfigService: ApiConfigService,
  ) {
    this.logger = new Logger(GatewayProcessor.name);
    this.sourceChain = apiConfigService.getSourceChainName();
  }

  async handleEvent(rawEvent: NotifierEvent) {
    const eventName = BinaryUtils.base64Decode(rawEvent.topics[0]);

    if (rawEvent.identifier === EventIdentifiers.CALL_CONTRACT && eventName === Events.CONTRACT_CALL_EVENT) {
      await this.handleContractCallEvent(rawEvent);

      return;
    }

    if (rawEvent.identifier === EventIdentifiers.EXECUTE) {
      if (eventName === Events.CONTRACT_CALL_APPROVED_EVENT) {
        await this.handleContractCallApprovedEvent(rawEvent);
      } else if (eventName === Events.OPERATORSHIP_TRANSFERRED_EVENT) {
        await this.handleOperatorshipTransferredEvent(rawEvent);
      }

      return;
    }

    if (
      rawEvent.identifier === EventIdentifiers.VALIDATE_CONTRACT_CALL &&
      eventName === Events.CONTRACT_CALL_EXECUTED_EVENT
    ) {
      await this.handleContractCallExecutedEvent(rawEvent);

      return;
    }
  }

  private async handleContractCallEvent(rawEvent: NotifierEvent) {
    const event = this.gatewayContract.decodeContractCallEvent(TransactionEvent.fromHttpResponse(rawEvent));

    const id = `${this.sourceChain}:${rawEvent.txHash}:${UNSUPPORTED_LOG_INDEX}`;
    const contractCallEvent = await this.contractCallEventRepository.create({
      id,
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

    // A duplicate might exist in the database, so we can skip creation in this case
    if (!contractCallEvent) {
      return;
    }

    // TODO: Test if this works correctly
    this.grpcService.verify(contractCallEvent).subscribe({
      next: async (value) => {
        if (value.success) {
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

  private async handleOperatorshipTransferredEvent(rawEvent: NotifierEvent) {
    const trasnsferData = this.gatewayContract.decodeOperatorshipTransferredEvent(
      TransactionEvent.fromHttpResponse(rawEvent),
    );

    const id = `${this.sourceChain}:${rawEvent.txHash}:${UNSUPPORTED_LOG_INDEX}`;

    await this.grpcService.verifyWorkerSet(
      id,
      trasnsferData.newOperators,
      trasnsferData.newWeights,
      trasnsferData.newThreshold,
    );
  }

  private async handleContractCallExecutedEvent(rawEvent: NotifierEvent) {
    const commandId = this.gatewayContract.decodeContractCallExecutedEvent(TransactionEvent.fromHttpResponse(rawEvent));

    const contractCallApproved = await this.contractCallApprovedRepository.findByCommandId(commandId);

    if (!contractCallApproved) {
      return;
    }

    contractCallApproved.status = ContractCallApprovedStatus.SUCCESS;
    contractCallApproved.successTimes = (contractCallApproved.successTimes || 0) + 1;

    await this.contractCallApprovedRepository.updateStatusAndSuccessTimes(contractCallApproved);
  }
}
