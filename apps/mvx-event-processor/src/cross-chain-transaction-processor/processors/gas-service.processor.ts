import { Injectable, Logger } from '@nestjs/common';
import { Events } from '@mvx-monorepo/common/utils/event.enum';
import { GasServiceContract } from '@mvx-monorepo/common/contracts/gas-service.contract';
import { GasPaidStatus, Prisma } from '@prisma/client';
import { ContractCallEventRepository } from '@mvx-monorepo/common/database/repository/contract-call-event.repository';
import { GasPaidRepository } from '@mvx-monorepo/common/database/repository/gas-paid.repository';
import { GasAddedEvent, GasPaidForContractCallEvent } from '@mvx-monorepo/common/contracts/entities/gas-service-events';
import BigNumber from 'bignumber.js';
import { ITransactionEvent, ITransactionOnNetwork } from '@multiversx/sdk-core/out';
import { DecodingUtils } from '@mvx-monorepo/common/utils/decoding.utils';
import { Components } from '@mvx-monorepo/common/api/entities/axelar.gmp.api';
import GasRefundedEvent = Components.Schemas.GasRefundedEvent;
import Event = Components.Schemas.Event;
import GasCreditEvent = Components.Schemas.GasCreditEvent;

@Injectable()
export class GasServiceProcessor {
  private logger: Logger;

  constructor(
    private readonly gasServiceContract: GasServiceContract,
    private readonly contractCallEventRepository: ContractCallEventRepository,
    private readonly gasPaidRepository: GasPaidRepository,
  ) {
    this.logger = new Logger(GasServiceProcessor.name);
  }

  async handleGasServiceEvent(
    rawEvent: ITransactionEvent,
    transaction: ITransactionOnNetwork,
    index: number,
  ): Promise<Event | undefined> {
    const eventName = rawEvent.topics?.[0]?.toString();

    if (eventName === Events.GAS_PAID_FOR_CONTRACT_CALL_EVENT) {
      const event = this.gasServiceContract.decodeGasPaidForContractCallEvent(rawEvent);

      return await this.handleGasPaidEvent(event, transaction.hash, index);
    }

    if (eventName === Events.NATIVE_GAS_PAID_FOR_CONTRACT_CALL_EVENT) {
      const event = this.gasServiceContract.decodeNativeGasPaidForContractCallEvent(rawEvent);

      return await this.handleGasPaidEvent(event, transaction.hash, index);
    }

    if (eventName === Events.GAS_ADDED_EVENT) {
      const event = this.gasServiceContract.decodeGasAddedEvent(rawEvent);

      return await this.handleGasAddedEvent(event, transaction.sender.bech32(), transaction.hash, index);
    }

    if (eventName === Events.NATIVE_GAS_ADDED_EVENT) {
      const event = this.gasServiceContract.decodeNativeGasAddedEvent(rawEvent);

      return await this.handleGasAddedEvent(event, transaction.sender.bech32(), transaction.hash, index);
    }

    if (eventName === Events.REFUNDED_EVENT) {
      const event = this.gasServiceContract.decodeRefundedEvent(rawEvent);

      await this.gasPaidRepository.updateRefundedValue(
        event.txHash,
        event.logIndex,
        event.data.token,
        event.data.receiver.bech32(),
        event.data.amount.toString(),
      );

      const gasRefundedEvent: GasRefundedEvent = {
        eventID: DecodingUtils.getEventId(transaction.hash, index),
        messageID: DecodingUtils.getEventId(event.txHash, event.logIndex),
        recipientAddress: event.data.receiver.bech32(),
        refundedAmount: {
          tokenID: event.data.token,
          amount: event.data.amount.toFixed(),
        },
        cost: {
          amount: '0', // TODO: How to calculate cost?
        },
        meta: {
          txID: transaction.hash,
          fromAddress: transaction.sender.bech32(),
          finalized: true,
        },
      };

      return {
        type: 'GAS_REFUNDED',
        ...gasRefundedEvent,
      };
    }

    return undefined;
  }

  private async handleGasPaidEvent(
    event: GasPaidForContractCallEvent,
    txHash: string,
    index: number,
  ): Promise<Event | undefined> {
    const gasPaid: Prisma.GasPaidCreateInput = {
      txHash: txHash,
      sourceAddress: event.sender.bech32(),
      destinationAddress: event.destinationAddress,
      destinationChain: event.destinationChain,
      payloadHash: event.data.payloadHash,
      gasToken: event.data.gasToken,
      gasValue: event.data.gasFeeAmount.toFixed(),
      refundAddress: event.data.refundAddress.bech32(),
      status: GasPaidStatus.PENDING,
    };

    const contractCallEvent = await this.contractCallEventRepository.findWithoutGasPaid(gasPaid);

    // TODO: How to handle this another way?
    if (!contractCallEvent) {
      return undefined;
    }

    gasPaid.ContractCallEvent = { connect: contractCallEvent };

    await this.gasPaidRepository.create(gasPaid);

    const gasCreditEvent: GasCreditEvent = {
      eventID: DecodingUtils.getEventId(txHash, index),
      messageID: DecodingUtils.getEventId(contractCallEvent.txHash, contractCallEvent.eventIndex),
      refundAddress: event.data.refundAddress.bech32(),
      payment: {
        tokenID: event.data.gasToken,
        amount: event.data.gasFeeAmount.toFixed(),
      },
      meta: {
        txID: txHash,
        fromAddress: event.sender.bech32(),
        finalized: true,
      },
    };

    return {
      type: 'GAS_CREDIT',
      ...gasCreditEvent,
    };
  }

  private async handleGasAddedEvent(
    event: GasAddedEvent,
    sender: string,
    txHash: string,
    index: number,
  ): Promise<Event | undefined> {
    const contractCallEvent = await this.contractCallEventRepository.findOnePending(event.txHash, event.logIndex);

    if (!contractCallEvent) {
      this.logger.warn('Received a GasAddedEvent but could find existing contract call entry');

      return undefined;
    }

    const gasPaid = contractCallEvent.gasPaidEntries.find(
      (gasPaid) =>
        gasPaid.gasToken === event.data.gasToken && gasPaid.refundAddress === event.data.refundAddress.bech32(),
    );

    if (!gasPaid) {
      this.logger.warn('Received a GasAddedEvent but could find existing gas paid entry');

      return undefined;
    }

    gasPaid.txHash = txHash;
    gasPaid.gasValue = new BigNumber(gasPaid.gasValue).plus(event.data.gasFeeAmount).toString();

    await this.gasPaidRepository.update(gasPaid.id, gasPaid);

    const gasCreditEvent: GasCreditEvent = {
      eventID: DecodingUtils.getEventId(txHash, index),
      messageID: DecodingUtils.getEventId(contractCallEvent.txHash, contractCallEvent.eventIndex),
      refundAddress: event.data.refundAddress.bech32(),
      payment: {
        tokenID: event.data.gasToken,
        amount: event.data.gasFeeAmount.toFixed(),
      },
      meta: {
        txID: txHash,
        fromAddress: sender,
        finalized: true,
      },
    };

    return {
      type: 'GAS_CREDIT',
      ...gasCreditEvent,
    };
  }
}
