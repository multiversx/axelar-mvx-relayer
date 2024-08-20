import {
  AbiRegistry,
  IAddress,
  ITransactionEvent,
  ResultsParser,
  SmartContract,
  Transaction,
  TransactionPayload,
} from '@multiversx/sdk-core/out';
import { Injectable } from '@nestjs/common';
import { Events } from '../utils/event.enum';
import { TransactionEvent } from '@multiversx/sdk-network-providers/out';
import {
  ContractCallEvent,
  MessageApprovedEvent,
  WeightedSigners,
} from '@mvx-monorepo/common/contracts/entities/gateway-events';
import { DecodingUtils } from '@mvx-monorepo/common/utils/decoding.utils';

@Injectable()
export class GatewayContract {
  constructor(
    private readonly smartContract: SmartContract,
    private readonly abi: AbiRegistry,
    private readonly resultsParser: ResultsParser,
    private readonly chainId: string,
  ) {}

  buildTransactionExternalFunction(externalData: string, sender: IAddress, nonce: number): Transaction {
    return new Transaction({
      sender,
      nonce,
      receiver: this.smartContract.getAddress(),
      data: new TransactionPayload(externalData),
      gasLimit: 0, // These will actually be set before sending the transaction to the chain
      chainID: this.chainId,
    });
  }

  decodeContractCallEvent(event: ITransactionEvent): ContractCallEvent {
    const eventDefinition = this.abi.getEvent(Events.CONTRACT_CALL_EVENT);
    const outcome = this.resultsParser.parseEvent(
      {
        topics: event.topics.map((topic) => Buffer.from(topic.hex(), 'hex')),
        dataPayload: event.dataPayload,
        additionalData: event.additionalData,
      },
      eventDefinition,
    );

    return {
      sender: outcome.sender,
      destinationChain: outcome.destination_chain.toString(),
      destinationAddress: outcome.destination_contract_address.toString(),
      payloadHash: DecodingUtils.decodeByteArrayToHex(outcome.payload_hash),
      payload: outcome.payload,
    };
  }

  decodeMessageApprovedEvent(event: TransactionEvent): MessageApprovedEvent {
    const eventDefinition = this.abi.getEvent(Events.MESSAGE_APPROVED_EVENT);
    const outcome = this.resultsParser.parseEvent(event, eventDefinition);

    return {
      commandId: DecodingUtils.decodeByteArrayToHex(outcome.command_id),
      sourceChain: outcome.source_chain.toString(),
      messageId: outcome.message_id.toString(),
      sourceAddress: outcome.source_address.toString(),
      contractAddress: outcome.contract_address,
      payloadHash: DecodingUtils.decodeByteArrayToHex(outcome.payload_hash),
    };
  }

  decodeSignersRotatedEvent(event: ITransactionEvent): WeightedSigners {
    const eventDefinition = this.abi.getEvent(Events.SIGNERS_ROTATED_EVENT);
    const outcome = this.resultsParser.parseEvent(
      {
        topics: event.topics.map((topic) => Buffer.from(topic.hex(), 'hex')),
        dataPayload: event.dataPayload,
        additionalData: event.additionalData,
      },
      eventDefinition,
    );

    const signers = outcome.signers;

    return {
      signers: signers.signers.map((signer: any) => ({
        signer: DecodingUtils.decodeByteArrayToHex(signer.signer),
        weight: signer.weight,
      })),
      threshold: signers.threshold,
      nonce: DecodingUtils.decodeByteArrayToHex(signers.nonce),
    };
  }

  decodeMessageExecutedEvent(event: TransactionEvent): string {
    const eventDefinition = this.abi.getEvent(Events.MESSAGE_EXECUTED_EVENT);
    const outcome = this.resultsParser.parseEvent(event, eventDefinition);

    return DecodingUtils.decodeByteArrayToHex(outcome.command_id);
  }
}
