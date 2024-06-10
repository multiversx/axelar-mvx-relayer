import { ApiConfigService } from '@mvx-monorepo/common';
import { createMock, DeepMocked } from '@golevelup/ts-jest';
import { Test } from '@nestjs/testing';
import { BinaryUtils } from '@multiversx/sdk-nestjs-common';
import { EventIdentifiers, Events } from '@mvx-monorepo/common/utils/event.enum';
import { ContractCallEventRepository } from '@mvx-monorepo/common/database/repository/contract-call-event.repository';
import { GatewayProcessor } from './gateway.processor';
import { NotifierEvent } from '../event-processor/types';
import { Address } from '@multiversx/sdk-core/out';
import { MessageApproved, MessageApprovedStatus, ContractCallEventStatus } from '@prisma/client';
import { GrpcService } from '@mvx-monorepo/common/grpc/grpc.service';
import { GatewayContract } from '@mvx-monorepo/common/contracts/gateway.contract';
import { MessageApprovedEvent, ContractCallEvent } from '@mvx-monorepo/common/contracts/entities/gateway-events';
import { TransactionEvent } from '@multiversx/sdk-network-providers/out';
import { MessageApprovedRepository } from '@mvx-monorepo/common/database/repository/message-approved.repository';
import { Subject } from 'rxjs';
import { ErrorCode, VerifyResponse } from '@mvx-monorepo/common/grpc/entities/amplifier';

describe('ContractCallProcessor', () => {
  let gatewayContract: DeepMocked<GatewayContract>;
  let contractCallEventRepository: DeepMocked<ContractCallEventRepository>;
  let messageApprovedRepository: DeepMocked<MessageApprovedRepository>;
  let grpcService: DeepMocked<GrpcService>;
  let apiConfigService: DeepMocked<ApiConfigService>;

  let service: GatewayProcessor;

  const contractCallEvent: ContractCallEvent = {
    sender: Address.fromBech32('erd1qqqqqqqqqqqqqpgqzqvm5ywqqf524efwrhr039tjs29w0qltkklsa05pk7'),
    destinationChain: 'ethereum',
    destinationAddress: 'destinationAddress',
    payloadHash: 'ebc84cbd75ba5516bf45e7024a9e12bc3c5c880f73e3a5beca7ebba52b2867a7',
    payload: Buffer.from('payload'),
  };
  const messageApprovedEvent: MessageApprovedEvent = {
    commandId: '0c38359b7a35c755573659d797afec315bb0e51374a056745abd9764715a15da',
    sourceChain: 'ethereum',
    messageId: 'messageId',
    sourceAddress: 'sourceAddress',
    contractAddress: Address.fromBech32('erd1qqqqqqqqqqqqqpgqzqvm5ywqqf524efwrhr039tjs29w0qltkklsa05pk7'),
    payloadHash: 'ebc84cbd75ba5516bf45e7024a9e12bc3c5c880f73e3a5beca7ebba52b2867a7',
  };

  beforeEach(async () => {
    gatewayContract = createMock();
    contractCallEventRepository = createMock();
    messageApprovedRepository = createMock();
    grpcService = createMock();
    apiConfigService = createMock();

    const moduleRef = await Test.createTestingModule({
      providers: [GatewayProcessor],
    })
      .useMocker((token) => {
        if (token === GatewayContract) {
          return gatewayContract;
        }

        if (token === ContractCallEventRepository) {
          return contractCallEventRepository;
        }

        if (token === MessageApprovedRepository) {
          return messageApprovedRepository;
        }

        if (token === GrpcService) {
          return grpcService;
        }

        if (token === ApiConfigService) {
          return apiConfigService;
        }

        return null;
      })
      .compile();

    gatewayContract.decodeContractCallEvent.mockReturnValue(contractCallEvent);
    gatewayContract.decodeMessageApprovedEvent.mockReturnValue(messageApprovedEvent);
    gatewayContract.decodeMessageExecutedEvent.mockReturnValue(messageApprovedEvent.commandId);

    service = moduleRef.get(GatewayProcessor);
  });

  it('Should not handle event', async () => {
    const rawEvent: NotifierEvent = {
      txHash: 'txHash',
      address: 'mockGatewayAddress',
      identifier: 'any',
      data: '',
      topics: [BinaryUtils.base64Encode('any')],
    };

    await service.handleEvent(rawEvent);

    expect(gatewayContract.decodeContractCallEvent).not.toHaveBeenCalled();
    expect(gatewayContract.decodeMessageApprovedEvent).not.toHaveBeenCalled();
    expect(contractCallEventRepository.create).not.toHaveBeenCalled();
    expect(messageApprovedRepository.create).not.toHaveBeenCalled();
    expect(grpcService.verify).not.toHaveBeenCalled();
    expect(grpcService.getPayload).not.toHaveBeenCalled();
  });

  describe('handleContractCallEvent', () => {
    const data = contractCallEvent.payload;

    const rawEvent: NotifierEvent = {
      txHash: 'txHash',
      address: 'mockGatewayAddress',
      identifier: EventIdentifiers.CALL_CONTRACT,
      data: data.toString('base64'),
      topics: [
        BinaryUtils.base64Encode(Events.CONTRACT_CALL_EVENT),
        Buffer.from((contractCallEvent.sender as Address).hex(), 'hex').toString('base64'),
        BinaryUtils.base64Encode(contractCallEvent.destinationChain),
        BinaryUtils.base64Encode(contractCallEvent.destinationAddress),
        Buffer.from(contractCallEvent.payloadHash, 'hex').toString('base64'),
      ],
    };

    it('Should handle event success', async () => {
      const observable = new Subject<VerifyResponse>();
      grpcService.verify.mockReturnValueOnce(observable);

      await service.handleEvent(rawEvent);

      expect(gatewayContract.decodeContractCallEvent).toHaveBeenCalledTimes(1);
      expect(gatewayContract.decodeContractCallEvent).toHaveBeenCalledWith(TransactionEvent.fromHttpResponse(rawEvent));
      expect(contractCallEventRepository.create).toHaveBeenCalledTimes(1);
      expect(contractCallEventRepository.create).toHaveBeenCalledWith({
        id: 'txHash-0',
        txHash: 'txHash',
        eventIndex: 0,
        status: ContractCallEventStatus.PENDING,
        sourceAddress: 'erd1qqqqqqqqqqqqqpgqzqvm5ywqqf524efwrhr039tjs29w0qltkklsa05pk7',
        sourceChain: 'multiversx',
        destinationAddress: 'destinationAddress',
        destinationChain: 'ethereum',
        payloadHash: 'ebc84cbd75ba5516bf45e7024a9e12bc3c5c880f73e3a5beca7ebba52b2867a7',
        payload: Buffer.from('payload'),
      });
      expect(grpcService.verify).toHaveBeenCalledTimes(1);

      observable.next({
        message: undefined,
        error: undefined,
      });
      observable.complete();

      expect(contractCallEventRepository.updateStatus).toHaveBeenCalledTimes(1);
      expect(contractCallEventRepository.updateStatus).toHaveBeenCalledWith({
        id: 'multiversx_txHash-0',
        txHash: 'txHash',
        eventIndex: 0,
        status: ContractCallEventStatus.APPROVED,
        sourceAddress: 'erd1qqqqqqqqqqqqqpgqzqvm5ywqqf524efwrhr039tjs29w0qltkklsa05pk7',
        sourceChain: 'multiversx',
        destinationAddress: 'destinationAddress',
        destinationChain: 'ethereum',
        payloadHash: 'ebc84cbd75ba5516bf45e7024a9e12bc3c5c880f73e3a5beca7ebba52b2867a7',
        payload: Buffer.from('payload'),
      });
    });

    it('Should handle error success', async () => {
      const observable = new Subject<VerifyResponse>();
      grpcService.verify.mockReturnValueOnce(observable);

      await service.handleEvent(rawEvent);

      expect(gatewayContract.decodeContractCallEvent).toHaveBeenCalledTimes(1);
      expect(contractCallEventRepository.create).toHaveBeenCalledTimes(1);
      expect(grpcService.verify).toHaveBeenCalledTimes(1);

      observable.next({
        message: undefined,
        error: {
          error: 'error',
          errorCode: ErrorCode.VERIFICATION_FAILED,
        },
      });
      observable.complete();

      expect(contractCallEventRepository.updateStatus).not.toHaveBeenCalled();
    });

    it('Should not handle duplicate', async () => {
      contractCallEventRepository.create.mockReturnValueOnce(Promise.resolve(null));

      await service.handleEvent(rawEvent);

      expect(gatewayContract.decodeContractCallEvent).toHaveBeenCalledTimes(1);
      expect(gatewayContract.decodeContractCallEvent).toHaveBeenCalledWith(TransactionEvent.fromHttpResponse(rawEvent));
      expect(contractCallEventRepository.create).toHaveBeenCalledTimes(1);
      expect(grpcService.verify).not.toHaveBeenCalled();
    });

    it('Should throw error can not save in database', async () => {
      contractCallEventRepository.create.mockRejectedValue(new Error('Can not save in database'));

      await expect(service.handleEvent(rawEvent)).rejects.toThrow();

      expect(gatewayContract.decodeContractCallEvent).toHaveBeenCalledTimes(1);
      expect(gatewayContract.decodeContractCallEvent).toHaveBeenCalledWith(TransactionEvent.fromHttpResponse(rawEvent));
      expect(contractCallEventRepository.create).toHaveBeenCalledTimes(1);
      expect(grpcService.verify).not.toHaveBeenCalled();
    });
  });

  describe('handleMessageApprovedEvent', () => {
    const rawEvent: NotifierEvent = {
      txHash: 'txHash',
      address: 'mockGatewayAddress',
      identifier: EventIdentifiers.APPROVE_MESSAGES,
      data: '',
      topics: [
        BinaryUtils.base64Encode(Events.MESSAGE_APPROVED_EVENT),
        Buffer.from('0c38359b7a35c755573659d797afec315bb0e51374a056745abd9764715a15da', 'hex').toString('base64'),
        BinaryUtils.base64Encode('ethereum'),
        BinaryUtils.base64Encode('messageId'),
        BinaryUtils.base64Encode('sourceAddress'),
        Buffer.from(
          Address.fromBech32('erd1qqqqqqqqqqqqqpgqzqvm5ywqqf524efwrhr039tjs29w0qltkklsa05pk7').hex(),
          'hex',
        ).toString('base64'),
        Buffer.from('ebc84cbd75ba5516bf45e7024a9e12bc3c5c880f73e3a5beca7ebba52b2867a7', 'hex').toString('base64'),
      ],
    };

    it('Should handle event', async () => {
      grpcService.getPayload.mockReturnValueOnce(Promise.resolve(Buffer.from('payload')));

      await service.handleEvent(rawEvent);

      expect(gatewayContract.decodeMessageApprovedEvent).toHaveBeenCalledTimes(1);
      expect(gatewayContract.decodeMessageApprovedEvent).toHaveBeenCalledWith(
        TransactionEvent.fromHttpResponse(rawEvent),
      );
      expect(grpcService.getPayload).toHaveBeenCalledTimes(1);
      expect(grpcService.getPayload).toHaveBeenCalledWith(messageApprovedEvent.payloadHash);
      expect(messageApprovedRepository.create).toHaveBeenCalledTimes(1);
      expect(messageApprovedRepository.create).toHaveBeenCalledWith({
        commandId: '0c38359b7a35c755573659d797afec315bb0e51374a056745abd9764715a15da',
        txHash: 'txHash',
        status: MessageApprovedStatus.PENDING,
        sourceAddress: 'sourceAddress',
        sourceChain: 'ethereum',
        messageId: 'messageId',
        contractAddress: 'erd1qqqqqqqqqqqqqpgqzqvm5ywqqf524efwrhr039tjs29w0qltkklsa05pk7',
        payloadHash: 'ebc84cbd75ba5516bf45e7024a9e12bc3c5c880f73e3a5beca7ebba52b2867a7',
        payload: Buffer.from('payload'),
        retry: 0,
      });
    });

    it('Should throw error can not save in database', async () => {
      grpcService.getPayload.mockReturnValueOnce(Promise.resolve(Buffer.from('payload')));

      messageApprovedRepository.create.mockReturnValueOnce(Promise.resolve(null));

      await expect(service.handleEvent(rawEvent)).rejects.toThrow();

      expect(gatewayContract.decodeMessageApprovedEvent).toHaveBeenCalledTimes(1);
      expect(gatewayContract.decodeMessageApprovedEvent).toHaveBeenCalledWith(
        TransactionEvent.fromHttpResponse(rawEvent),
      );
      expect(grpcService.getPayload).toHaveBeenCalledTimes(1);
      expect(grpcService.getPayload).toHaveBeenCalledWith(messageApprovedEvent.payloadHash);
      expect(messageApprovedRepository.create).toHaveBeenCalledTimes(1);
    });
  });

  describe('handleSignersRotatedEvent', () => {
    const rawEvent: NotifierEvent = {
      txHash: 'txHash',
      address: 'mockGatewayAddress',
      identifier: EventIdentifiers.ROTATE_SIGNERS,
      data: Buffer.from(
        '000000030139472eff6886771a982f3083da5d421f24c29181e63888228dc81ca60d69e100000001018049d639e5a6980d1cd2392abcce41029cda74a1563523a202f09641cc2618f80000000101b2a11555ce521e4944e09ab17549d85b487dcd26c84b5017a39e31a3670889ba00000001010000000103290decd9548b62a8d60345a988386fc84ba6bc95484008f6362f93160ef3e563',
        'hex',
      ).toString('base64'),
      topics: [
        BinaryUtils.base64Encode(Events.SIGNERS_ROTATED_EVENT),
        BinaryUtils.hexToBase64('01'),
        Buffer.from('0c38359b7a35c755573659d797afec315bb0e51374a056745abd9764715a15da', 'hex').toString('base64'),
      ],
    };

    it('Should handle event', async () => {
      await service.handleEvent(rawEvent);

      expect(gatewayContract.decodeSignersRotatedEvent).toHaveBeenCalledTimes(1);
      expect(gatewayContract.decodeSignersRotatedEvent).toHaveBeenCalledWith(
        TransactionEvent.fromHttpResponse(rawEvent),
      );
      expect(grpcService.verifyVerifierSet).toHaveBeenCalledTimes(1);
    });

    it('Should handle event error', async () => {
      grpcService.verifyVerifierSet.mockReturnValueOnce(
        Promise.resolve({
          published: false,
          receiptId: '',
        }),
      );

      await service.handleEvent(rawEvent);

      expect(gatewayContract.decodeSignersRotatedEvent).toHaveBeenCalledTimes(1);
      expect(gatewayContract.decodeSignersRotatedEvent).toHaveBeenCalledWith(
        TransactionEvent.fromHttpResponse(rawEvent),
      );
      expect(grpcService.verifyVerifierSet).toHaveBeenCalledTimes(1);
    });
  });

  describe('handleMessageExecutedEvent', () => {
    const rawEvent: NotifierEvent = {
      txHash: 'txHash',
      address: 'mockGatewayAddress',
      identifier: EventIdentifiers.VALIDATE_MESSAGE,
      data: '',
      topics: [
        BinaryUtils.base64Encode(Events.MESSAGE_EXECUTED_EVENT),
        Buffer.from('0c38359b7a35c755573659d797afec315bb0e51374a056745abd9764715a15da', 'hex').toString('base64'),
        BinaryUtils.base64Encode('ethereum'),
        BinaryUtils.base64Encode('messageId'),
      ],
    };

    it('Should handle event update contract call approved', async () => {
      const messageApproved: MessageApproved = {
        commandId: '0c38359b7a35c755573659d797afec315bb0e51374a056745abd9764715a15da',
        txHash: 'txHash',
        status: MessageApprovedStatus.PENDING,
        sourceAddress: 'sourceAddress',
        sourceChain: 'ethereum',
        messageId: 'messageId',
        contractAddress: 'erd1qqqqqqqqqqqqqpgqzqvm5ywqqf524efwrhr039tjs29w0qltkklsa05pk7',
        payloadHash: 'ebc84cbd75ba5516bf45e7024a9e12bc3c5c880f73e3a5beca7ebba52b2867a7',
        payload: Buffer.from('payload'),
        retry: 0,
        executeTxHash: null,
        updatedAt: new Date(),
        createdAt: new Date(),
        successTimes: null,
      };

      messageApprovedRepository.findByCommandId.mockReturnValueOnce(Promise.resolve(messageApproved));

      await service.handleEvent(rawEvent);

      expect(gatewayContract.decodeMessageExecutedEvent).toHaveBeenCalledTimes(1);
      expect(gatewayContract.decodeMessageExecutedEvent).toHaveBeenCalledWith(
        TransactionEvent.fromHttpResponse(rawEvent),
      );
      expect(messageApprovedRepository.findByCommandId).toHaveBeenCalledTimes(1);
      expect(messageApprovedRepository.findByCommandId).toHaveBeenCalledWith(
        '0c38359b7a35c755573659d797afec315bb0e51374a056745abd9764715a15da',
      );
      expect(messageApprovedRepository.updateStatusAndSuccessTimes).toHaveBeenCalledTimes(1);
      expect(messageApprovedRepository.updateStatusAndSuccessTimes).toHaveBeenCalledWith({
        ...messageApproved,
        status: MessageApprovedStatus.SUCCESS,
        successTimes: 1,
      });
    });

    it('Should handle event no contract call approved', async () => {
      messageApprovedRepository.findByCommandId.mockReturnValueOnce(Promise.resolve(null));

      await service.handleEvent(rawEvent);

      expect(gatewayContract.decodeMessageExecutedEvent).toHaveBeenCalledTimes(1);
      expect(gatewayContract.decodeMessageExecutedEvent).toHaveBeenCalledWith(
        TransactionEvent.fromHttpResponse(rawEvent),
      );
      expect(messageApprovedRepository.findByCommandId).toHaveBeenCalledTimes(1);
      expect(messageApprovedRepository.findByCommandId).toHaveBeenCalledWith(
        '0c38359b7a35c755573659d797afec315bb0e51374a056745abd9764715a15da',
      );
      expect(messageApprovedRepository.updateManyPartial).not.toHaveBeenCalled();
    });
  });
});
