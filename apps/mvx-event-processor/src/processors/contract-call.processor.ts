import { Injectable } from '@nestjs/common';
import { NotifierEvent } from '../event-processor/types';
import { GatewayContract } from '@mvx-monorepo/common/contracts/gateway.contract';
import { TransactionEvent } from '@multiversx/sdk-network-providers/out';
import { ContractCallEventRepository } from '@mvx-monorepo/common/database/repository/contract-call-event.repository';
import { ApiConfigService } from '@mvx-monorepo/common';
import { ContractCallEventStatus } from '@prisma/client';

@Injectable()
export class ContractCallProcessor {
  private sourceChain: string;

  constructor(
    private readonly gatewayContract: GatewayContract,
    private readonly contractCallEventRepository: ContractCallEventRepository,
    apiConfigService: ApiConfigService,
  ) {
    this.sourceChain = apiConfigService.getSourceChainName();
  }

  async handleEvent(rawEvent: NotifierEvent) {
    const event = this.gatewayContract.decodeContractCallEvent(TransactionEvent.fromHttpResponse(rawEvent));

    await this.contractCallEventRepository.create({
      id: `${this.sourceChain}:${rawEvent.txHash}:${rawEvent.order}`,
      txHash: rawEvent.txHash,
      eventIndex: rawEvent.order,
      status: ContractCallEventStatus.PENDING,
      sourceAddress: event.sender.bech32(),
      sourceChain: this.sourceChain,
      destinationAddress: event.destination_contract_address,
      destinationChain: event.destination_chain,
      payloadHash: event.data.hash,
      payload: event.data.payload,
    });
  }
}
