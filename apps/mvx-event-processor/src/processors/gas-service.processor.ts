import { Injectable, Logger } from '@nestjs/common';
import { ProcessorInterface } from './entities/processor.interface';
import { NotifierEvent } from '../event-processor/types';
import { BinaryUtils } from '@multiversx/sdk-nestjs-common';
import { Events } from '@mvx-monorepo/common/utils/event.enum';
import { GasServiceContract } from '@mvx-monorepo/common/contracts/gas-service.contract';
import { TransactionEvent } from '@multiversx/sdk-network-providers/out';
import { GasPaidStatus, Prisma } from '@prisma/client';
import { ContractCallEventRepository } from '@mvx-monorepo/common/database/repository/contract-call-event.repository';
import { GasPaidRepository } from '@mvx-monorepo/common/database/repository/gas-paid.repository';
import { GasAddedEvent, GasPaidForContractCallEvent } from '@mvx-monorepo/common/contracts/entities/gas-service-events';
import BigNumber from 'bignumber.js';

@Injectable()
export class GasServiceProcessor implements ProcessorInterface {
  private logger: Logger;

  constructor(
    private readonly gasServiceContract: GasServiceContract,
    private readonly contractCallEventRepository: ContractCallEventRepository,
    private readonly gasPaidRepository: GasPaidRepository,
  ) {
    this.logger = new Logger(GasServiceProcessor.name);
  }

  async handleEvent(rawEvent: NotifierEvent) {
    const eventName = BinaryUtils.base64Decode(rawEvent.topics[0]);

    if (eventName === Events.GAS_PAID_FOR_CONTRACT_CALL_EVENT) {
      const event = this.gasServiceContract.decodeGasPaidForContractCallEvent(
        TransactionEvent.fromHttpResponse(rawEvent),
      );

      await this.handleGasPaidEvents(event, rawEvent.txHash);

      return;
    }

    if (eventName === Events.NATIVE_GAS_PAID_FOR_CONTRACT_CALL_EVENT) {
      const event = this.gasServiceContract.decodeNativeGasPaidForContractCallEvent(
        TransactionEvent.fromHttpResponse(rawEvent),
      );

      await this.handleGasPaidEvents(event, rawEvent.txHash);

      return;
    }

    if (eventName === Events.GAS_ADDED_EVENT) {
      const event = this.gasServiceContract.decodeGasAddedEvent(TransactionEvent.fromHttpResponse(rawEvent));

      await this.handleGasAddedEvents(event, rawEvent.txHash);

      return;
    }

    if (eventName === Events.NATIVE_GAS_ADDED_EVENT) {
      const event = this.gasServiceContract.decodeNativeGasAddedEvent(TransactionEvent.fromHttpResponse(rawEvent));

      await this.handleGasAddedEvents(event, rawEvent.txHash);

      return;
    }

    if (eventName === Events.REFUNDED_EVENT) {
      const event = this.gasServiceContract.decodeRefundedEvent(TransactionEvent.fromHttpResponse(rawEvent));

      await this.gasPaidRepository.updateRefundedValue(
        event.txHash,
        event.logIndex,
        event.data.token,
        event.data.receiver.bech32(),
        event.data.amount.toString(),
      );
    }
  }

  async handleGasPaidEvents(event: GasPaidForContractCallEvent, txHash: string) {
    const gasPaid: Prisma.GasPaidCreateInput = {
      txHash: txHash,
      sourceAddress: event.sender.bech32(),
      destinationAddress: event.destinationAddress,
      destinationChain: event.destinationChain,
      payloadHash: event.data.payloadHash,
      gasToken: event.data.gasToken,
      gasValue: event.data.gasFeeAmount.toString(),
      refundAddress: event.data.refundAddress.bech32(),
      status: GasPaidStatus.PENDING,
    };

    const contractCallEvent = await this.contractCallEventRepository.findWithoutGasPaid(gasPaid);

    if (contractCallEvent) {
      gasPaid.ContractCallEvent = { connect: contractCallEvent };
    }

    await this.gasPaidRepository.create(gasPaid);
  }

  async handleGasAddedEvents(event: GasAddedEvent, rawEventTxHash: string) {
    const contractCallEvent = await this.contractCallEventRepository.findOnePending(event.txHash, event.logIndex);

    if (!contractCallEvent) {
      this.logger.warn('Received a GasAddedEvent but could find existing contract call entry');

      return;
    }

    const gasPaid = contractCallEvent.gasPaidEntries.find(
      (gasPaid) =>
        gasPaid.gasToken === event.data.gasToken && gasPaid.refundAddress === event.data.refundAddress.bech32(),
    );

    if (!gasPaid) {
      this.logger.warn('Received a GasAddedEvent but could find existing gas paid entry');

      return;
    }

    gasPaid.txHash = rawEventTxHash;
    gasPaid.gasValue = new BigNumber(gasPaid.gasValue).plus(event.data.gasFeeAmount).toString();

    await this.gasPaidRepository.update(gasPaid.id, gasPaid);
  }
}
