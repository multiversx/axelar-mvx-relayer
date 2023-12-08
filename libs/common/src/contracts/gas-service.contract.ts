import { AbiRegistry, ResultsParser, SmartContract } from '@multiversx/sdk-core/out';
import { Injectable, Logger } from '@nestjs/common';
import { Events } from '../utils/event.enum';
import { TransactionEvent } from '@multiversx/sdk-network-providers/out';
import BigNumber from 'bignumber.js';
import {
  GasAddedEvent,
  GasPaidForContractCallEvent,
  RefundedEvent,
} from '@mvx-monorepo/common/contracts/entities/gas-service-events';

@Injectable()
export class GasServiceContract {
  // @ts-ignore
  private readonly logger: Logger;

  constructor(
    // @ts-ignore
    private readonly smartContract: SmartContract,
    private readonly abi: AbiRegistry,
    private readonly resultsParser: ResultsParser,
  ) {
    this.logger = new Logger(GasServiceContract.name);
  }

  decodeGasPaidForContractCallEvent(event: TransactionEvent): GasPaidForContractCallEvent {
    const eventDefinition = this.abi.getEvent(Events.GAS_PAID_FOR_CONTRACT_CALL_EVENT);
    const outcome = this.resultsParser.parseEvent(event, eventDefinition);

    return {
      sender: outcome.sender,
      destinationChain: outcome.destination_chain.toString(),
      destinationAddress: outcome.destination_contract_address.toString(),
      data: {
        payloadHash: Buffer.from(outcome.data.hash.map((number: BigNumber) => number.toNumber())).toString('hex'),
        gasToken: outcome.data.gas_token.toString(),
        gasFeeAmount: outcome.data.gas_fee_amount,
        refundAddress: outcome.data.refund_address,
      },
    };
  }

  decodeNativeGasPaidForContractCallEvent(event: TransactionEvent): GasPaidForContractCallEvent {
    const eventDefinition = this.abi.getEvent(Events.GAS_PAID_FOR_CONTRACT_CALL_EVENT);
    const outcome = this.resultsParser.parseEvent(event, eventDefinition);

    return {
      sender: outcome.sender,
      destinationChain: outcome.destination_chain.toString(),
      destinationAddress: outcome.destination_contract_address.toString(),
      data: {
        payloadHash: Buffer.from(outcome.data.hash.map((number: BigNumber) => number.toNumber())).toString('hex'),
        gasToken: null,
        gasFeeAmount: outcome.data.value,
        refundAddress: outcome.data.refund_address,
      },
    };
  }

  decodeGasAddedEvent(event: TransactionEvent): GasAddedEvent {
    const eventDefinition = this.abi.getEvent(Events.GAS_ADDED_EVENT);
    const outcome = this.resultsParser.parseEvent(event, eventDefinition);

    return {
      txHash: outcome.tx_hash.toString('hex'),
      logIndex: outcome.log_index.toNumber(),
      data: {
        gasToken: outcome.data.gas_token.toString(),
        gasFeeAmount: outcome.data.value,
        refundAddress: outcome.data.refund_address,
      },
    };
  }

  decodeNativeGasAddedEvent(event: TransactionEvent): GasAddedEvent {
    const eventDefinition = this.abi.getEvent(Events.NATIVE_GAS_ADDED_EVENT);
    const outcome = this.resultsParser.parseEvent(event, eventDefinition);

    return {
      txHash: outcome.tx_hash.toString('hex'),
      logIndex: outcome.log_index.toNumber(),
      data: {
        gasToken: null,
        gasFeeAmount: outcome.data.value,
        refundAddress: outcome.data.refund_address,
      },
    };
  }

  decodeRefundedEvent(event: TransactionEvent): RefundedEvent {
    const eventDefinition = this.abi.getEvent(Events.REFUNDED_EVENT);
    const outcome = this.resultsParser.parseEvent(event, eventDefinition);

    const token = outcome.data.gas_token.toString();

    return {
      txHash: outcome.tx_hash.toString('hex'),
      logIndex: outcome.log_index.toNumber(),
      data: {
        receiver: outcome.data.receiver,
        token: token === 'EGLD' ? null : token, // TODO: Save 'EGLD' to a const
        amount: outcome.data.amount,
      },
    };
  }
}
