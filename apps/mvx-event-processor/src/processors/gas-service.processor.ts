import { Injectable } from '@nestjs/common';
import { ProcessorInterface } from './entities/processor.interface';
import { NotifierEvent } from '../event-processor/types';
import { BinaryUtils } from '@multiversx/sdk-nestjs-common';
import { Events } from '@mvx-monorepo/common/utils/event.enum';
import { GasServiceContract } from '@mvx-monorepo/common/contracts/gas-service.contract';
import { TransactionEvent } from '@multiversx/sdk-network-providers/out';
import { GasPaidStatus, Prisma } from '@prisma/client';
import { ContractCallEventRepository } from '@mvx-monorepo/common/database/repository/contract-call-event.repository';
import { GasPaidRepository } from '@mvx-monorepo/common/database/repository/gas-paid.repository';

@Injectable()
export class GasServiceProcessor implements ProcessorInterface {
  constructor(
    private readonly gasServiceContract: GasServiceContract,
    private readonly contractCallEventRepository: ContractCallEventRepository,
    private readonly gasPaidRepository: GasPaidRepository,
  ) {}

  async handleEvent(rawEvent: NotifierEvent) {
    const eventName = BinaryUtils.base64Decode(rawEvent.topics[0]);

    if (eventName === Events.GAS_PAID_FOR_CONTRACT_CALL_EVENT) {
      const event = this.gasServiceContract.decodeGasPaidForContractCallEvent(
        TransactionEvent.fromHttpResponse(rawEvent),
      );

      const gasPaid = {
        txHash: rawEvent.txHash,
        sourceAddress: event.sender.bech32(),
        destinationAddress: event.destination_contract_address,
        destinationChain: event.destination_chain,
        payloadHash: event.data.payload_hash,
        gasToken: event.data.gas_token,
        gasValue: event.data.gas_fee_amount.toString(),
        refundAddress: event.data.refund_address.bech32(),
        status: GasPaidStatus.PENDING,
      };

      await this.handleGasPaidEvents(gasPaid);

      return;
    }

    if (eventName === Events.NATIVE_GAS_PAID_FOR_CONTRACT_CALL_EVENT) {
      const event = this.gasServiceContract.decodeNativeGasPaidForContractCallEvent(
        TransactionEvent.fromHttpResponse(rawEvent),
      );

      const gasPaid = {
        txHash: rawEvent.txHash,
        sourceAddress: event.sender.bech32(),
        destinationAddress: event.destination_contract_address,
        destinationChain: event.destination_chain,
        payloadHash: event.data.payload_hash,
        gasToken: null,
        gasValue: event.data.value.toString(),
        refundAddress: event.data.refund_address.bech32(),
        status: GasPaidStatus.PENDING,
      };

      await this.handleGasPaidEvents(gasPaid);

      return;
    }

    if (eventName === Events.GAS_ADDED_EVENT) {
      const event = this.gasServiceContract.decodeGasAddedEvent(TransactionEvent.fromHttpResponse(rawEvent));

      await this.handleGasAddedEvents(
        event.tx_hash,
        event.log_index,
        event.data.gas_token,
        event.data.gas_fee_amount.toString(),
        event.data.refund_address.bech32(),
        rawEvent.txHash,
      );

      return;
    }

    if (eventName === Events.NATIVE_GAS_ADDED_EVENT) {
      const event = this.gasServiceContract.decodeNativeGasAddedEvent(TransactionEvent.fromHttpResponse(rawEvent));

      await this.handleGasAddedEvents(
        event.tx_hash,
        event.log_index,
        null,
        event.data.value.toString(),
        event.data.refund_address.bech32(),
        rawEvent.txHash,
      );

      return;
    }

    if (eventName === Events.REFUNDED_EVENT) {
      const event = this.gasServiceContract.decodeRefundedEvent(TransactionEvent.fromHttpResponse(rawEvent));

      await this.gasPaidRepository.updateRefundedValue(
        event.tx_hash,
        event.log_index,
        event.data.token,
        event.data.receiver.bech32(),
        event.data.amount.toString(),
      );
    }
  }

  async handleGasPaidEvents(gasPaid: Prisma.GasPaidCreateInput) {
    const contractCallEvent = await this.contractCallEventRepository.findWithoutGasPaid(gasPaid);

    if (contractCallEvent) {
      gasPaid.ContractCallEvent = { connect: contractCallEvent };
    }

    await this.gasPaidRepository.create(gasPaid);
  }

  async handleGasAddedEvents(
    txHash: string,
    logIndex: number,
    gasToken: string | null,
    gasValue: string,
    refundAddress: string,
    rawEventTxHash: string
  ) {
    const contractCallEvent = await this.contractCallEventRepository.findPending(txHash, logIndex);

    if (!contractCallEvent) {
      return;
    }

    const gasPaid = {
      txHash: rawEventTxHash,
      sourceAddress: contractCallEvent.sourceAddress,
      destinationAddress: contractCallEvent.destinationAddress,
      destinationChain: contractCallEvent.destinationChain,
      payloadHash: contractCallEvent.payloadHash,
      gasToken,
      gasValue,
      refundAddress,
      status: GasPaidStatus.PENDING,
    };

    await this.gasPaidRepository.create(gasPaid);
  }
}
