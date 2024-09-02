import { Test, TestingModule } from '@nestjs/testing';
import { GasServiceProcessor } from './gas-service.processor';
import { createMock, DeepMocked } from '@golevelup/ts-jest';
import { GasServiceContract } from '@mvx-monorepo/common/contracts/gas-service.contract';
import { ContractCallEventRepository } from '@mvx-monorepo/common/database/repository/contract-call-event.repository';
import { GasPaidRepository } from '@mvx-monorepo/common/database/repository/gas-paid.repository';
import { NotifierEvent } from '../../event-processor/types';
import { BinaryUtils } from '@multiversx/sdk-nestjs-common';
import { Events } from '@mvx-monorepo/common/utils/event.enum';
import {
  GasAddedEvent,
  GasPaidForContractCallEvent,
  RefundedEvent,
} from '@mvx-monorepo/common/contracts/entities/gas-service-events';
import { Address } from '@multiversx/sdk-core/out';
import BigNumber from 'bignumber.js';
import { ContractCallEvent, GasPaidStatus } from '@prisma/client';
import { ContractCallEventWithGasPaid } from '@mvx-monorepo/common/database/entities/contract-call-event';

describe('GasServiceProcessor', () => {
  let gasServiceContract: DeepMocked<GasServiceContract>;
  let contractCallEventRepository: DeepMocked<ContractCallEventRepository>;
  let gasPaidRepository: DeepMocked<GasPaidRepository>;

  let service: GasServiceProcessor;

  beforeEach(async () => {
    gasServiceContract = createMock();
    contractCallEventRepository = createMock();
    gasPaidRepository = createMock();

    const module: TestingModule = await Test.createTestingModule({
      providers: [GasServiceProcessor],
    })
      .useMocker((token) => {
        if (token === GasServiceContract) {
          return gasServiceContract;
        }

        if (token === ContractCallEventRepository) {
          return contractCallEventRepository;
        }

        if (token === GasPaidRepository) {
          return gasPaidRepository;
        }

        return null;
      })
      .compile();

    service = module.get<GasServiceProcessor>(GasServiceProcessor);
  });

  it('Should not handle event', async () => {
    const rawEvent: NotifierEvent = {
      txHash: 'txHash',
      address: 'mockGatewayAddress',
      identifier: 'callContract',
      data: '',
      topics: [BinaryUtils.base64Encode(Events.CONTRACT_CALL_EVENT)],
    };

    await service.handleEvent(rawEvent);

    expect(gasPaidRepository.create).not.toHaveBeenCalled();
    expect(gasPaidRepository.updateRefundedValue).not.toHaveBeenCalled();
  });

  const getMockGasPaid = (
    eventName: string = Events.GAS_PAID_FOR_CONTRACT_CALL_EVENT,
    gasToken: string | null = 'WEGLD-123456',
  ) => {
    const rawEvent: NotifierEvent = {
      txHash: 'txHash',
      address: 'mockGasServiceContract',
      identifier: 'any',
      data: '',
      topics: [BinaryUtils.base64Encode(eventName)],
    };

    const event: GasPaidForContractCallEvent = {
      sender: Address.fromBech32('erd1qqqqqqqqqqqqqpgqzqvm5ywqqf524efwrhr039tjs29w0qltkklsa05pk7'),
      destinationChain: 'ethereum',
      destinationAddress: 'destinationAddress',
      data: {
        payloadHash: 'ebc84cbd75ba5516bf45e7024a9e12bc3c5c880f73e3a5beca7ebba52b2867a7',
        gasToken,
        gasFeeAmount: new BigNumber('654321'),
        refundAddress: Address.fromBech32('erd1qqqqqqqqqqqqqpgqzqvm5ywqqf524efwrhr039tjs29w0qltkklsa05pk7'),
      },
    };

    const gasPaid: any = {
      txHash: rawEvent.txHash,
      sourceAddress: event.sender.bech32(),
      destinationAddress: event.destinationAddress,
      destinationChain: event.destinationChain,
      payloadHash: event.data.payloadHash,
      gasToken: event.data.gasToken,
      gasValue: event.data.gasFeeAmount.toString(),
      refundAddress: event.data.refundAddress.bech32(),
      status: GasPaidStatus.PENDING,
    };

    return { rawEvent, event, gasPaid };
  };

  async function assertEventGasPaidForContractCall(
    rawEvent: NotifierEvent,
    gasPaid: any,
    contractCallEvent: any = null,
  ) {
    contractCallEventRepository.findWithoutGasPaid.mockReturnValueOnce(Promise.resolve(contractCallEvent));

    await service.handleEvent(rawEvent);

    expect(contractCallEventRepository.findWithoutGasPaid).toHaveBeenCalledTimes(1);
    expect(contractCallEventRepository.findWithoutGasPaid).toHaveBeenCalledWith(gasPaid);

    expect(gasPaidRepository.create).toHaveBeenCalledTimes(1);
    expect(gasPaidRepository.create).toHaveBeenCalledWith(gasPaid);
  }

  describe('Handle event gas paid for contract call', () => {
    const { rawEvent, event, gasPaid } = getMockGasPaid();

    it('Should handle no existing contract call', async () => {
      gasServiceContract.decodeGasPaidForContractCallEvent.mockReturnValueOnce(event);

      await assertEventGasPaidForContractCall(rawEvent, gasPaid);
    });

    it('Should handle with existing contract call', async () => {
      gasServiceContract.decodeGasPaidForContractCallEvent.mockReturnValueOnce(event);

      const contractCallEvent: DeepMocked<ContractCallEvent> = createMock();
      gasPaid.ContractCallEvent = { connect: contractCallEvent };

      await assertEventGasPaidForContractCall(rawEvent, gasPaid, contractCallEvent);
    });
  });

  describe('Handle event native gas paid for contract call', () => {
    const { rawEvent, event, gasPaid } = getMockGasPaid(Events.NATIVE_GAS_PAID_FOR_CONTRACT_CALL_EVENT, null);

    it('Should handle no existing contract call', async () => {
      gasServiceContract.decodeNativeGasPaidForContractCallEvent.mockReturnValueOnce(event);

      await assertEventGasPaidForContractCall(rawEvent, gasPaid);
    });

    it('Should handle with existing contract call', async () => {
      gasServiceContract.decodeNativeGasPaidForContractCallEvent.mockReturnValueOnce(event);

      const contractCallEvent: DeepMocked<ContractCallEvent> = createMock();
      gasPaid.ContractCallEvent = { connect: contractCallEvent };

      await assertEventGasPaidForContractCall(rawEvent, gasPaid, contractCallEvent);
    });
  });

  const getMockGasAdded = (eventName: string = Events.GAS_ADDED_EVENT, gasToken: string | null = 'WEGLD-123456') => {
    const rawEvent: NotifierEvent = {
      txHash: 'txHash',
      address: 'mockGasServiceContract',
      identifier: 'any',
      data: '',
      topics: [BinaryUtils.base64Encode(eventName)],
    };

    const event: GasAddedEvent = {
      txHash: 'txHash',
      logIndex: 1,
      data: {
        gasToken,
        gasFeeAmount: new BigNumber('1000'),
        refundAddress: Address.fromBech32('erd1qqqqqqqqqqqqqpgqzqvm5ywqqf524efwrhr039tjs29w0qltkklsa05pk7'),
      },
    };

    return { rawEvent, event };
  };

  async function assertGasAddedEvent(
    rawEvent: NotifierEvent,
    event: GasAddedEvent,
    contractCallEvent: any = null,
    extraGasPaid: any = null,
  ) {
    contractCallEventRepository.findOnePending.mockReturnValueOnce(Promise.resolve(contractCallEvent));

    await service.handleEvent(rawEvent);

    expect(contractCallEventRepository.findOnePending).toHaveBeenCalledTimes(1);
    expect(contractCallEventRepository.findOnePending).toHaveBeenCalledWith(event.txHash, event.logIndex);

    if (!extraGasPaid) {
      expect(gasPaidRepository.update).not.toHaveBeenCalled();
    } else {
      expect(gasPaidRepository.update).toHaveBeenCalledTimes(1);
      expect(gasPaidRepository.update).toHaveBeenCalledWith(extraGasPaid.id, extraGasPaid);
    }
  }

  describe('Handle event gas added', () => {
    const { rawEvent, event } = getMockGasAdded();

    it('Should handle no existing contract call', async () => {
      gasServiceContract.decodeGasAddedEvent.mockReturnValueOnce(event);

      await assertGasAddedEvent(rawEvent, event);
    });

    it('Should handle no gas paid different token', async () => {
      gasServiceContract.decodeGasAddedEvent.mockReturnValueOnce(event);

      const contractCallEvent: DeepMocked<ContractCallEventWithGasPaid> = createMock();
      contractCallEvent.gasPaidEntries = [
        {
          gasToken: 'other',
          refundAddress: event.data.refundAddress.bech32(),
        },
      ] as any;

      await assertGasAddedEvent(rawEvent, event, contractCallEvent);
    });

    it('Should handle no gas paid different refund address', async () => {
      gasServiceContract.decodeGasAddedEvent.mockReturnValueOnce(event);

      const contractCallEvent: DeepMocked<ContractCallEventWithGasPaid> = createMock();
      contractCallEvent.gasPaidEntries = [
        {
          gasToken: event.data.gasToken,
          refundAddress: 'other address',
        },
      ] as any;

      await assertGasAddedEvent(rawEvent, event, contractCallEvent);
    });

    it('Should handle no gas paid update', async () => {
      gasServiceContract.decodeGasAddedEvent.mockReturnValueOnce(event);

      const contractCallEvent: DeepMocked<ContractCallEventWithGasPaid> = createMock();
      const gasPaid: any = {
        id: 1234,
        gasToken: event.data.gasToken,
        refundAddress: event.data.refundAddress.bech32(),
        gasValue: '2000',
      };
      contractCallEvent.gasPaidEntries = [gasPaid];

      await assertGasAddedEvent(rawEvent, event, contractCallEvent, {
        ...gasPaid,
        txHash: rawEvent.txHash,
        gasValue: '3000',
      });
    });
  });

  describe('Handle event native gas added', () => {
    const { rawEvent, event } = getMockGasAdded(Events.NATIVE_GAS_ADDED_EVENT, null);

    it('Should handle no existing contract call', async () => {
      gasServiceContract.decodeNativeGasAddedEvent.mockReturnValueOnce(event);

      await assertGasAddedEvent(rawEvent, event);
    });

    it('Should handle no gas paid different token', async () => {
      gasServiceContract.decodeNativeGasAddedEvent.mockReturnValueOnce(event);

      const contractCallEvent: DeepMocked<ContractCallEventWithGasPaid> = createMock();
      contractCallEvent.gasPaidEntries = [
        {
          gasToken: 'other',
          refundAddress: event.data.refundAddress.bech32(),
        },
      ] as any;

      await assertGasAddedEvent(rawEvent, event, contractCallEvent);
    });

    it('Should handle no gas paid different refund address', async () => {
      gasServiceContract.decodeNativeGasAddedEvent.mockReturnValueOnce(event);

      const contractCallEvent: DeepMocked<ContractCallEventWithGasPaid> = createMock();
      contractCallEvent.gasPaidEntries = [
        {
          gasToken: event.data.gasToken,
          refundAddress: 'other address',
        },
      ] as any;

      await assertGasAddedEvent(rawEvent, event, contractCallEvent);
    });

    it('Should handle no gas paid update', async () => {
      gasServiceContract.decodeNativeGasAddedEvent.mockReturnValueOnce(event);

      const contractCallEvent: DeepMocked<ContractCallEventWithGasPaid> = createMock();
      const gasPaid: any = {
        id: 1234,
        gasToken: event.data.gasToken,
        refundAddress: event.data.refundAddress.bech32(),
        gasValue: '2000',
      };
      contractCallEvent.gasPaidEntries = [gasPaid];

      await assertGasAddedEvent(rawEvent, event, contractCallEvent, {
        ...gasPaid,
        txHash: rawEvent.txHash,
        gasValue: '3000',
      });
    });
  });

  describe('Handle event refunded event', () => {
    const rawEvent: NotifierEvent = {
      txHash: 'txHash',
      address: 'mockGasServiceContract',
      identifier: 'any',
      data: '',
      topics: [BinaryUtils.base64Encode(Events.REFUNDED_EVENT)],
    };

    const event: RefundedEvent = {
      txHash: 'txHash',
      logIndex: 1,
      data: {
        receiver: Address.fromBech32('erd1qqqqqqqqqqqqqpgqzqvm5ywqqf524efwrhr039tjs29w0qltkklsa05pk7'),
        token: 'WEGLD-654321',
        amount: new BigNumber('1000'),
      },
    };

    it('Should handle', async () => {
      gasServiceContract.decodeRefundedEvent.mockReturnValueOnce(event);

      await service.handleEvent(rawEvent);

      expect(gasPaidRepository.updateRefundedValue).toHaveBeenCalledTimes(1);
      expect(gasPaidRepository.updateRefundedValue).toHaveBeenCalledWith(
        event.txHash,
        event.logIndex,
        event.data.token,
        event.data.receiver.bech32(),
        event.data.amount.toString(),
      );
    });
  });
});
