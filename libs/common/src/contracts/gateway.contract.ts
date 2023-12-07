import { AbiRegistry, ResultsParser, SmartContract } from '@multiversx/sdk-core/out';
import { Injectable, Logger } from '@nestjs/common';
import { Events } from '../utils/event.enum';
import { TransactionEvent } from '@multiversx/sdk-network-providers/out';
import { ContractCallEvent } from '@mvx-monorepo/common/contracts/entities/contract-call-event';
import BigNumber from 'bignumber.js';

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

  decodeContractCallEvent(event: TransactionEvent): ContractCallEvent {
    const eventDefinition = this.abi.getEvent(Events.CONTRACT_CALL_EVENT);
    const outcome = this.resultsParser.parseEvent(event, eventDefinition);

    return {
      sender: outcome.sender,
      destination_chain: outcome.destination_chain.toString(),
      destination_contract_address: outcome.destination_contract_address.toString(),
      data: {
        payload_hash: Buffer.from(outcome.data.hash.map((number: BigNumber) => number.toNumber())).toString('hex'),
        payload: outcome.data.payload,
      },
    };
  }
}
