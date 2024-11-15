import {
  AbiRegistry,
  IAddress,
  ITransactionEvent,
  SmartContract,
  Transaction,
  TransactionPayload,
} from '@multiversx/sdk-core/out';
import { Injectable } from '@nestjs/common';
import { Events } from '../utils/event.enum';
import {
  ContractCallEvent,
  MessageApprovedEvent, MessageExecutedEvent,
  SignersRotatedEvent,
} from '@mvx-monorepo/common/contracts/entities/gateway-events';
import { DecodingUtils } from '@mvx-monorepo/common/utils/decoding.utils';

@Injectable()
export class GatewayContract {
  constructor(
    private readonly smartContract: SmartContract,
    private readonly abi: AbiRegistry,
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
    const outcome = DecodingUtils.parseTransactionEvent(event, eventDefinition);

    return {
      sender: outcome.sender,
      destinationChain: outcome.destination_chain.toString(),
      destinationAddress: outcome.destination_contract_address.toString(),
      payloadHash: DecodingUtils.decodeByteArrayToHex(outcome.payload_hash),
      payload: outcome.payload,
    };
  }

  decodeMessageApprovedEvent(event: ITransactionEvent): MessageApprovedEvent {
    const eventDefinition = this.abi.getEvent(Events.MESSAGE_APPROVED_EVENT);
    const outcome = DecodingUtils.parseTransactionEvent(event, eventDefinition);

    return {
      commandId: DecodingUtils.decodeByteArrayToHex(outcome.command_id),
      sourceChain: outcome.source_chain.toString(),
      messageId: outcome.message_id.toString(),
      sourceAddress: outcome.source_address.toString(),
      contractAddress: outcome.contract_address,
      payloadHash: DecodingUtils.decodeByteArrayToHex(outcome.payload_hash),
    };
  }

  decodeMessageExecutedEvent(event: ITransactionEvent): MessageExecutedEvent {
    const eventDefinition = this.abi.getEvent(Events.MESSAGE_EXECUTED_EVENT);
    const outcome = DecodingUtils.parseTransactionEvent(event, eventDefinition);

    return {
      commandId: DecodingUtils.decodeByteArrayToHex(outcome.command_id),
      sourceChain: outcome.source_chain.toString(),
      messageId: outcome.message_id.toString(),
    };
  }

  decodeSignersRotatedEvent(event: ITransactionEvent): SignersRotatedEvent {
    const eventDefinition = this.abi.getEvent(Events.SIGNERS_ROTATED_EVENT);
    const outcome = DecodingUtils.parseTransactionEvent(event, eventDefinition);

    const signers = outcome.signers;

    return {
      epoch: outcome.epoch,
      signersHash: DecodingUtils.decodeByteArrayToHex(outcome.signers_hash),
      signers: signers.signers.map((signer: any) => ({
        signer: DecodingUtils.decodeByteArrayToHex(signer.signer),
        weight: signer.weight,
      })),
      threshold: signers.threshold,
      nonce: DecodingUtils.decodeByteArrayToHex(signers.nonce),
    };
  }
}
