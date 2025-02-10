import { AbiRegistry, Interaction, ITransactionEvent, SmartContract, TokenTransfer } from '@multiversx/sdk-core/out';
import { Injectable } from '@nestjs/common';
import { AbiCoder } from 'ethers';
import { Events } from '@mvx-monorepo/common/utils/event.enum';
import { DecodingUtils } from '@mvx-monorepo/common/utils/decoding.utils';
import {
  InterchainTokenDeploymentStartedEvent,
  InterchainTransferEvent,
} from '@mvx-monorepo/common/contracts/entities/its-events';

const MESSAGE_TYPE_DEPLOY_INTERCHAIN_TOKEN = 1;
const MESSAGE_TYPE_RECEIVE_FROM_HUB = 4;

const DEFAULT_ESDT_ISSUE_COST = '50000000000000000'; // 0.05 EGLD

@Injectable()
export class ItsContract {
  constructor(
    private readonly smartContract: SmartContract,
    private readonly abi: AbiRegistry,
  ) {}

  execute(
    sourceChain: string,
    messageId: string,
    sourceAddress: string,
    payload: Buffer,
    executedTimes: number,
  ): Interaction {
    const messageType = this.decodeExecutePayloadMessageType(payload);

    const interaction = this.smartContract.methods.execute([sourceChain, messageId, sourceAddress, payload]);

    // The second time this transaction is executed it needs to contain and EGLD transfer for issuing ESDT
    if (messageType === MESSAGE_TYPE_DEPLOY_INTERCHAIN_TOKEN && executedTimes === 1) {
      interaction.withValue(TokenTransfer.egldFromBigInteger(DEFAULT_ESDT_ISSUE_COST));
    }

    return interaction;
  }

  private decodeExecutePayloadMessageType(payload: Buffer): number {
    let result = AbiCoder.defaultAbiCoder().decode(['uint256'], payload);

    const originalMessageType = Number(result[0]);

    if (originalMessageType !== MESSAGE_TYPE_RECEIVE_FROM_HUB) {
      return originalMessageType;
    }

    result = AbiCoder.defaultAbiCoder().decode(['uint256', 'string', 'bytes'], payload);

    const originalPayload = result[2];
    const newResult = AbiCoder.defaultAbiCoder().decode(['uint256'], originalPayload);

    return Number(newResult[0]);
  }

  decodeInterchainTokenDeploymentStartedEvent(event: ITransactionEvent): InterchainTokenDeploymentStartedEvent {
    const eventDefinition = this.abi.getEvent(Events.INTERCHAIN_TOKEN_DEPLOYMENT_STARTED_EVENT);
    const outcome = DecodingUtils.parseTransactionEvent(event, eventDefinition);

    return {
      tokenId: DecodingUtils.decodeByteArrayToHex(outcome.token_id),
      name: outcome.data.name.toString(),
      symbol: outcome.data.symbol.toString(),
      decimals: outcome.data.decimals.toNumber(),
      minter: outcome.data.minter,
      destinationChain: outcome.data.destination_chain.toString(),
    };
  }

  decodeInterchainTransferEvent(event: ITransactionEvent): InterchainTransferEvent {
    const eventDefinition = this.abi.getEvent(Events.INTERCHAIN_TRANSFER_EVENT);
    const outcome = DecodingUtils.parseTransactionEvent(event, eventDefinition);

    return {
      tokenId: DecodingUtils.decodeByteArrayToHex(outcome.token_id),
      sourceAddress: outcome.source_address,
      dataHash: DecodingUtils.decodeByteArrayToHex(outcome.data_hash),
      destinationChain: outcome.data.destination_chain.toString(),
      destinationAddress: outcome.data.destination_address,
      amount: outcome.data.amount,
    };
  }
}
