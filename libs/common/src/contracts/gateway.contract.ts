import { AbiRegistry, BytesValue, IAddress, ResultsParser, SmartContract, Transaction } from '@multiversx/sdk-core/out';
import { Injectable, Logger } from '@nestjs/common';
import { Events } from '../utils/event.enum';
import { TransactionEvent } from '@multiversx/sdk-network-providers/out';
import { ContractCallApprovedEvent, ContractCallEvent } from '@mvx-monorepo/common/contracts/entities/gateway-events';
import { DecodingUtils } from '@mvx-monorepo/common/utils/decoding.utils';

@Injectable()
export class GatewayContract {
  // @ts-ignore
  private readonly logger: Logger;

  constructor(
    // @ts-ignore
    private readonly smartContract: SmartContract,
    private readonly abi: AbiRegistry,
    private readonly resultsParser: ResultsParser,
  ) {
    this.logger = new Logger(GatewayContract.name);
  }

  buildExecuteTransaction(executeData: Uint8Array, sender: IAddress): Transaction {
    return this.smartContract.methodsExplicit
      .execute([new BytesValue(Buffer.from(executeData))])
      .withSender(sender)
      .buildTransaction();
  }

  decodeContractCallEvent(event: TransactionEvent): ContractCallEvent {
    const eventDefinition = this.abi.getEvent(Events.CONTRACT_CALL_EVENT);
    const outcome = this.resultsParser.parseEvent(event, eventDefinition);

    return {
      sender: outcome.sender,
      destinationChain: outcome.destination_chain.toString(),
      destinationAddress: outcome.destination_contract_address.toString(),
      data: {
        payloadHash: DecodingUtils.decodeKeccak256Hash(outcome.data.hash),
        payload: outcome.data.payload,
      },
    };
  }

  decodeContractCallApprovedEvent(event: TransactionEvent): ContractCallApprovedEvent {
    const eventDefinition = this.abi.getEvent(Events.CONTRACT_CALL_APPROVED_EVENT);
    const outcome = this.resultsParser.parseEvent(event, eventDefinition);

    return {
      commandId: DecodingUtils.decodeKeccak256Hash(outcome.command_id),
      sourceChain: outcome.source_chain.toString(),
      sourceAddress: outcome.source_address.toString(),
      contractAddress: outcome.contract_address,
      payloadHash: DecodingUtils.decodeKeccak256Hash(outcome.payload_hash),
    };
  }

  decodeContractCallExecutedEvent(event: TransactionEvent): string {
    const eventDefinition = this.abi.getEvent(Events.CONTRACT_CALL_EXECUTED_EVENT);
    const outcome = this.resultsParser.parseEvent(event, eventDefinition);

    return DecodingUtils.decodeKeccak256Hash(outcome.command_id);
  }
}
