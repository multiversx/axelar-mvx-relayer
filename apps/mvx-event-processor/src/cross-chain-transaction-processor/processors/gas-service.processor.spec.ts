import { Test, TestingModule } from '@nestjs/testing';
import { GasServiceProcessor } from './gas-service.processor';
import { createMock, DeepMocked } from '@golevelup/ts-jest';
import { GasServiceContract } from '@mvx-monorepo/common/contracts/gas-service.contract';
import { BinaryUtils } from '@multiversx/sdk-nestjs-common';
import { Events } from '@mvx-monorepo/common/utils/event.enum';
import { ITransactionEvent } from '@multiversx/sdk-core/out';
import { ApiConfigService, GatewayContract } from '@mvx-monorepo/common';
import { TransactionEvent } from '@multiversx/sdk-network-providers/out';

describe('GasServiceProcessor', () => {
  let gasServiceContract: DeepMocked<GasServiceContract>;
  let gatewayContract: DeepMocked<GatewayContract>;
  let apiConfigService: DeepMocked<ApiConfigService>;

  let service: GasServiceProcessor;

  beforeEach(async () => {
    gasServiceContract = createMock();
    gatewayContract = createMock();
    apiConfigService = createMock();

    apiConfigService.getContractGateway.mockReturnValue('mockGatewayAddress');
    apiConfigService.getContractGasService.mockReturnValue('mockGasServiceAddress');

    const module: TestingModule = await Test.createTestingModule({
      providers: [GasServiceProcessor],
    })
      .useMocker((token) => {
        if (token === GasServiceContract) {
          return gasServiceContract;
        }

        if (token === GatewayContract) {
          return gatewayContract;
        }

        if (token === ApiConfigService) {
          return apiConfigService;
        }

        return null;
      })
      .compile();

    service = module.get<GasServiceProcessor>(GasServiceProcessor);
  });

  it('Should not handle event', async () => {
    const rawEvent: ITransactionEvent = TransactionEvent.fromHttpResponse({
      address: 'erd1qqqqqqqqqqqqqqqpqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqplllst77y4l',
      identifier: 'callContract',
      data: '',
      topics: [BinaryUtils.base64Encode(Events.CONTRACT_CALL_EVENT)],
    });

    service.handleGasServiceEvent(rawEvent, createMock(), 0);
  });

  // const getMockGasPaid = (
  //   eventName: string = Events.GAS_PAID_FOR_CONTRACT_CALL_EVENT,
  //   gasToken: string | null = 'WEGLD-123456',
  // ) => {
  //   const rawEvent: NotifierEvent = {
  //     txHash: 'txHash',
  //     address: 'mockGasServiceContract',
  //     identifier: 'any',
  //     data: '',
  //     topics: [BinaryUtils.base64Encode(eventName)],
  //   };
  //
  //   const event: GasPaidForContractCallEvent = {
  //     sender: Address.fromBech32('erd1qqqqqqqqqqqqqpgqzqvm5ywqqf524efwrhr039tjs29w0qltkklsa05pk7'),
  //     destinationChain: 'ethereum',
  //     destinationAddress: 'destinationAddress',
  //     data: {
  //       payloadHash: 'ebc84cbd75ba5516bf45e7024a9e12bc3c5c880f73e3a5beca7ebba52b2867a7',
  //       gasToken,
  //       gasFeeAmount: new BigNumber('654321'),
  //       refundAddress: Address.fromBech32('erd1qqqqqqqqqqqqqpgqzqvm5ywqqf524efwrhr039tjs29w0qltkklsa05pk7'),
  //     },
  //   };
  //
  //   const gasPaid: any = {
  //     txHash: rawEvent.txHash,
  //     sourceAddress: event.sender.bech32(),
  //     destinationAddress: event.destinationAddress,
  //     destinationChain: event.destinationChain,
  //     payloadHash: event.data.payloadHash,
  //     gasToken: event.data.gasToken,
  //     gasValue: event.data.gasFeeAmount.toString(),
  //     refundAddress: event.data.refundAddress.bech32(),
  //     status: GasPaidStatus.PENDING,
  //   };
  //
  //   return { rawEvent, event, gasPaid };
  // };
  //
  // async function assertEventGasPaidForContractCall(
  //   rawEvent: NotifierEvent,
  //   gasPaid: any,
  //   contractCallEvent: any = null,
  // ) {
  //   await service.handleEvent(rawEvent);
  // }
  //
  // describe('Handle event gas paid for contract call', () => {
  //   const { rawEvent, event, gasPaid } = getMockGasPaid();
  //
  //   it('Should handle no existing contract call', async () => {
  //     gasServiceContract.decodeGasPaidForContractCallEvent.mockReturnValueOnce(event);
  //
  //     await assertEventGasPaidForContractCall(rawEvent, gasPaid);
  //   });
  //
  //   it('Should handle with existing contract call', async () => {
  //     gasServiceContract.decodeGasPaidForContractCallEvent.mockReturnValueOnce(event);
  //
  //     const contractCallEvent: DeepMocked<ContractCallEvent> = createMock();
  //     gasPaid.ContractCallEvent = { connect: contractCallEvent };
  //
  //     await assertEventGasPaidForContractCall(rawEvent, gasPaid, contractCallEvent);
  //   });
  // });
  //
  // describe('Handle event native gas paid for contract call', () => {
  //   const { rawEvent, event, gasPaid } = getMockGasPaid(Events.NATIVE_GAS_PAID_FOR_CONTRACT_CALL_EVENT, null);
  //
  //   it('Should handle no existing contract call', async () => {
  //     gasServiceContract.decodeNativeGasPaidForContractCallEvent.mockReturnValueOnce(event);
  //
  //     await assertEventGasPaidForContractCall(rawEvent, gasPaid);
  //   });
  //
  //   it('Should handle with existing contract call', async () => {
  //     gasServiceContract.decodeNativeGasPaidForContractCallEvent.mockReturnValueOnce(event);
  //
  //     const contractCallEvent: DeepMocked<ContractCallEvent> = createMock();
  //     gasPaid.ContractCallEvent = { connect: contractCallEvent };
  //
  //     await assertEventGasPaidForContractCall(rawEvent, gasPaid, contractCallEvent);
  //   });
  // });
  //
  // const getMockGasAdded = (eventName: string = Events.GAS_ADDED_EVENT, gasToken: string | null = 'WEGLD-123456') => {
  //   const rawEvent: NotifierEvent = {
  //     txHash: 'txHash',
  //     address: 'mockGasServiceContract',
  //     identifier: 'any',
  //     data: '',
  //     topics: [BinaryUtils.base64Encode(eventName)],
  //   };
  //
  //   const event: GasAddedEvent = {
  //     txHash: 'txHash',
  //     logIndex: 1,
  //     data: {
  //       gasToken,
  //       gasFeeAmount: new BigNumber('1000'),
  //       refundAddress: Address.fromBech32('erd1qqqqqqqqqqqqqpgqzqvm5ywqqf524efwrhr039tjs29w0qltkklsa05pk7'),
  //     },
  //   };
  //
  //   return { rawEvent, event };
  // };
  //
  // async function assertGasAddedEvent(rawEvent: NotifierEvent, event: GasAddedEvent, contractCallEvent: any = null) {
  //   await service.handleEvent(rawEvent);
  // }
  //
  // describe('Handle event gas added', () => {
  //   const { rawEvent, event } = getMockGasAdded();
  //
  //   it('Should handle no existing contract call', async () => {
  //     gasServiceContract.decodeGasAddedEvent.mockReturnValueOnce(event);
  //
  //     await assertGasAddedEvent(rawEvent, event);
  //   });
  //
  //   it('Should handle no gas paid different token', async () => {
  //     gasServiceContract.decodeGasAddedEvent.mockReturnValueOnce(event);
  //
  //     const contractCallEvent: DeepMocked<ContractCallEventWithGasPaid> = createMock();
  //     contractCallEvent.gasPaidEntries = [
  //       {
  //         gasToken: 'other',
  //         refundAddress: event.data.refundAddress.bech32(),
  //       },
  //     ] as any;
  //
  //     await assertGasAddedEvent(rawEvent, event, contractCallEvent);
  //   });
  //
  //   it('Should handle no gas paid different refund address', async () => {
  //     gasServiceContract.decodeGasAddedEvent.mockReturnValueOnce(event);
  //
  //     const contractCallEvent: DeepMocked<ContractCallEventWithGasPaid> = createMock();
  //     contractCallEvent.gasPaidEntries = [
  //       {
  //         gasToken: event.data.gasToken,
  //         refundAddress: 'other address',
  //       },
  //     ] as any;
  //
  //     await assertGasAddedEvent(rawEvent, event, contractCallEvent);
  //   });
  //
  //   it('Should handle no gas paid update', async () => {
  //     gasServiceContract.decodeGasAddedEvent.mockReturnValueOnce(event);
  //
  //     const contractCallEvent: DeepMocked<ContractCallEventWithGasPaid> = createMock();
  //     const gasPaid: any = {
  //       id: 1234,
  //       gasToken: event.data.gasToken,
  //       refundAddress: event.data.refundAddress.bech32(),
  //       gasValue: '2000',
  //     };
  //     contractCallEvent.gasPaidEntries = [gasPaid];
  //
  //     await assertGasAddedEvent(rawEvent, event, contractCallEvent, {
  //       ...gasPaid,
  //       txHash: rawEvent.txHash,
  //       gasValue: '3000',
  //     });
  //   });
  // });
  //
  // describe('Handle event native gas added', () => {
  //   const { rawEvent, event } = getMockGasAdded(Events.NATIVE_GAS_ADDED_EVENT, null);
  //
  //   it('Should handle no existing contract call', async () => {
  //     gasServiceContract.decodeNativeGasAddedEvent.mockReturnValueOnce(event);
  //
  //     await assertGasAddedEvent(rawEvent, event);
  //   });
  //
  //   it('Should handle no gas paid different token', async () => {
  //     gasServiceContract.decodeNativeGasAddedEvent.mockReturnValueOnce(event);
  //
  //     const contractCallEvent: DeepMocked<ContractCallEventWithGasPaid> = createMock();
  //     contractCallEvent.gasPaidEntries = [
  //       {
  //         gasToken: 'other',
  //         refundAddress: event.data.refundAddress.bech32(),
  //       },
  //     ] as any;
  //
  //     await assertGasAddedEvent(rawEvent, event, contractCallEvent);
  //   });
  //
  //   it('Should handle no gas paid different refund address', async () => {
  //     gasServiceContract.decodeNativeGasAddedEvent.mockReturnValueOnce(event);
  //
  //     const contractCallEvent: DeepMocked<ContractCallEventWithGasPaid> = createMock();
  //     contractCallEvent.gasPaidEntries = [
  //       {
  //         gasToken: event.data.gasToken,
  //         refundAddress: 'other address',
  //       },
  //     ] as any;
  //
  //     await assertGasAddedEvent(rawEvent, event, contractCallEvent);
  //   });
  //
  //   it('Should handle no gas paid update', async () => {
  //     gasServiceContract.decodeNativeGasAddedEvent.mockReturnValueOnce(event);
  //
  //     const contractCallEvent: DeepMocked<ContractCallEventWithGasPaid> = createMock();
  //     const gasPaid: any = {
  //       id: 1234,
  //       gasToken: event.data.gasToken,
  //       refundAddress: event.data.refundAddress.bech32(),
  //       gasValue: '2000',
  //     };
  //     contractCallEvent.gasPaidEntries = [gasPaid];
  //
  //     await assertGasAddedEvent(rawEvent, event, contractCallEvent, {
  //       ...gasPaid,
  //       txHash: rawEvent.txHash,
  //       gasValue: '3000',
  //     });
  //   });
  // });
  //
  // describe('Handle event refunded event', () => {
  //   const rawEvent: NotifierEvent = {
  //     txHash: 'txHash',
  //     address: 'mockGasServiceContract',
  //     identifier: 'any',
  //     data: '',
  //     topics: [BinaryUtils.base64Encode(Events.REFUNDED_EVENT)],
  //   };
  //
  //   const event: RefundedEvent = {
  //     txHash: 'txHash',
  //     logIndex: 1,
  //     data: {
  //       receiver: Address.fromBech32('erd1qqqqqqqqqqqqqpgqzqvm5ywqqf524efwrhr039tjs29w0qltkklsa05pk7'),
  //       token: 'WEGLD-654321',
  //       amount: new BigNumber('1000'),
  //     },
  //   };
  //
  //   it('Should handle', async () => {
  //     gasServiceContract.decodeRefundedEvent.mockReturnValueOnce(event);
  //
  //     await service.handleEvent(rawEvent);
  //   });
  // });
});
