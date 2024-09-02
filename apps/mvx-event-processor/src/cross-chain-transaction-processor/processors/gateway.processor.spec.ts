import { createMock, DeepMocked } from '@golevelup/ts-jest';
import { Test } from '@nestjs/testing';
import { BinaryUtils } from '@multiversx/sdk-nestjs-common';
import { EventIdentifiers, Events } from '@mvx-monorepo/common/utils/event.enum';
import { GatewayProcessor } from './gateway.processor';
import { NotifierEvent } from '../../event-processor/types';
import { Address } from '@multiversx/sdk-core/out';
import { MessageApproved, MessageApprovedStatus } from '@prisma/client';
import { AxelarGmpApi } from '@mvx-monorepo/common/api/axelar.gmp.api';
import { GatewayContract } from '@mvx-monorepo/common/contracts/gateway.contract';
import { ContractCallEvent, MessageApprovedEvent } from '@mvx-monorepo/common/contracts/entities/gateway-events';
import { TransactionEvent } from '@multiversx/sdk-network-providers/out';
import { MessageApprovedRepository } from '@mvx-monorepo/common/database/repository/message-approved.repository';

describe('GatewayProcessor', () => {
  let gatewayContract: DeepMocked<GatewayContract>;
  let messageApprovedRepository: DeepMocked<MessageApprovedRepository>;
  let grpcService: DeepMocked<AxelarGmpApi>;

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
    messageApprovedRepository = createMock();
    grpcService = createMock();

    const moduleRef = await Test.createTestingModule({
      providers: [GatewayProcessor],
    })
      .useMocker((token) => {
        if (token === GatewayContract) {
          return gatewayContract;
        }

        if (token === MessageApprovedRepository) {
          return messageApprovedRepository;
        }

        if (token === AxelarGmpApi) {
          return grpcService;
        }

        return null;
      })
      .compile();

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
    expect(messageApprovedRepository.create).not.toHaveBeenCalled();
    expect(grpcService.getCallEvent).not.toHaveBeenCalled();
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

    it('Should handle event', async () => {
      const txHash = await service.handleEvent(rawEvent);

      expect(txHash).toEqual('txHash');
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
      const txHash = await service.handleEvent(rawEvent);

      expect(txHash).toEqual('txHash');
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

      messageApprovedRepository.findBySourceChainAndMessageId.mockReturnValueOnce(Promise.resolve(messageApproved));

      await service.handleEvent(rawEvent);

      expect(gatewayContract.decodeMessageExecutedEvent).toHaveBeenCalledTimes(1);
      expect(gatewayContract.decodeMessageExecutedEvent).toHaveBeenCalledWith(
        TransactionEvent.fromHttpResponse(rawEvent),
      );
      expect(messageApprovedRepository.findBySourceChainAndMessageId).toHaveBeenCalledTimes(1);
      expect(messageApprovedRepository.findBySourceChainAndMessageId).toHaveBeenCalledWith(
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
      messageApprovedRepository.findBySourceChainAndMessageId.mockReturnValueOnce(Promise.resolve(null));

      await service.handleEvent(rawEvent);

      expect(gatewayContract.decodeMessageExecutedEvent).toHaveBeenCalledTimes(1);
      expect(gatewayContract.decodeMessageExecutedEvent).toHaveBeenCalledWith(
        TransactionEvent.fromHttpResponse(rawEvent),
      );
      expect(messageApprovedRepository.findBySourceChainAndMessageId).toHaveBeenCalledTimes(1);
      expect(messageApprovedRepository.findBySourceChainAndMessageId).toHaveBeenCalledWith(
        '0c38359b7a35c755573659d797afec315bb0e51374a056745abd9764715a15da',
      );
      expect(messageApprovedRepository.updateManyPartial).not.toHaveBeenCalled();
    });
  });
});
