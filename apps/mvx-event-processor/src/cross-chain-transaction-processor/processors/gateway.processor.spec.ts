import { createMock, DeepMocked } from '@golevelup/ts-jest';
import { Test } from '@nestjs/testing';
import { BinaryUtils } from '@multiversx/sdk-nestjs-common';
import { EventIdentifiers, Events } from '@mvx-monorepo/common/utils/event.enum';
import { GatewayProcessor } from './gateway.processor';
import { Address, ITransactionEvent } from '@multiversx/sdk-core/out';
import { GatewayContract } from '@mvx-monorepo/common/contracts/gateway.contract';
import {
  ContractCallEvent,
  MessageApprovedEvent,
  MessageExecutedEvent,
  WeightedSigners,
} from '@mvx-monorepo/common/contracts/entities/gateway-events';
import { TransactionEvent, TransactionOnNetwork } from '@multiversx/sdk-network-providers/out';
import { MessageApprovedRepository } from '@mvx-monorepo/common/database/repository/message-approved.repository';
import { Components } from '@mvx-monorepo/common/api/entities/axelar.gmp.api';
import { MessageApproved, MessageApprovedStatus } from '@prisma/client';
import BigNumber from 'bignumber.js';
import CallEvent = Components.Schemas.CallEvent;
import MessageApprovedEventApi = Components.Schemas.MessageApprovedEvent;
import MessageExecutedEventApi = Components.Schemas.MessageExecutedEvent;

const mockGatewayContract = 'erd1qqqqqqqqqqqqqpgqvc7gdl0p4s97guh498wgz75k8sav6sjfjlwqh679jy';

describe('GatewayProcessor', () => {
  let gatewayContract: DeepMocked<GatewayContract>;
  let messageApprovedRepository: DeepMocked<MessageApprovedRepository>;

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
  const messageExecutedEvent: MessageExecutedEvent = {
    commandId: '0c38359b7a35c755573659d797afec315bb0e51374a056745abd9764715a15da',
    sourceChain: 'ethereum',
    messageId: 'messageId',
  };
  const weightedSigners: WeightedSigners = {
    signers: [
      {
        signer: '',
        weight: new BigNumber('1'),
      },
    ],
    threshold: new BigNumber('1'),
    nonce: '1234',
  };

  beforeEach(async () => {
    gatewayContract = createMock();
    messageApprovedRepository = createMock();

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

        return null;
      })
      .compile();

    gatewayContract.decodeMessageApprovedEvent.mockReturnValue(messageApprovedEvent);
    gatewayContract.decodeMessageExecutedEvent.mockReturnValue(messageExecutedEvent);

    service = moduleRef.get(GatewayProcessor);
  });

  it('Should not handle event', async () => {
    const rawEvent: ITransactionEvent = TransactionEvent.fromHttpResponse({
      address: 'erd1qqqqqqqqqqqqqqqpqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqplllst77y4l',
      identifier: 'callContract',
      data: '',
      topics: [BinaryUtils.base64Encode(Events.NATIVE_GAS_PAID_FOR_CONTRACT_CALL_EVENT)],
    });

    const result = await service.handleGatewayEvent(rawEvent, createMock(), 0, '100');

    expect(result).toBeUndefined();
    expect(gatewayContract.decodeContractCallEvent).not.toHaveBeenCalled();
    expect(gatewayContract.decodeMessageApprovedEvent).not.toHaveBeenCalled();
    expect(gatewayContract.decodeMessageExecutedEvent).not.toHaveBeenCalled();
    expect(gatewayContract.decodeSignersRotatedEvent).not.toHaveBeenCalled();
  });

  describe('handleContractCallEvent', () => {
    const data = contractCallEvent.payload;

    const rawEvent: TransactionEvent = TransactionEvent.fromHttpResponse({
      address: mockGatewayContract,
      identifier: EventIdentifiers.CALL_CONTRACT,
      data: data.toString('base64'),
      topics: [
        BinaryUtils.base64Encode(Events.CONTRACT_CALL_EVENT),
        Buffer.from((contractCallEvent.sender as Address).hex(), 'hex').toString('base64'),
        BinaryUtils.base64Encode(contractCallEvent.destinationChain),
        BinaryUtils.base64Encode(contractCallEvent.destinationAddress),
        Buffer.from(contractCallEvent.payloadHash, 'hex').toString('base64'),
      ],
    });

    it('Should handle event', async () => {
      gatewayContract.decodeContractCallEvent.mockReturnValueOnce(contractCallEvent);

      const transaction = createMock<TransactionOnNetwork>();
      transaction.hash = 'txHash';

      const result = await service.handleGatewayEvent(rawEvent, transaction, 0, '100');

      expect(gatewayContract.decodeContractCallEvent).toBeCalledTimes(1);

      expect(result).not.toBeUndefined();
      expect(result?.type).toBe('CALL');

      const event = result as CallEvent;

      expect(event.eventID).toBe('0xtxHash-0');
      expect(event.message.messageID).toBe('0xtxHash-0');
      expect(event.message.sourceChain).toBe('multiversx');
      expect(event.message.sourceAddress).toBe(contractCallEvent.sender.bech32());
      expect(event.message.destinationAddress).toBe(contractCallEvent.destinationAddress);
      expect(event.message.payloadHash).toBe(BinaryUtils.hexToBase64(contractCallEvent.payloadHash));
      expect(event.destinationChain).toBe(contractCallEvent.destinationChain);
      expect(event.payload).toBe(contractCallEvent.payload.toString('base64'));
      expect(event.meta).toEqual({
        txID: 'txHash',
        fromAddress: contractCallEvent.sender.bech32(),
        finalized: true,
      });
    });
  });

  describe('handleMessageApprovedEvent', () => {
    const rawEvent: TransactionEvent = TransactionEvent.fromHttpResponse({
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
    });

    it('Should handle event', async () => {
      gatewayContract.decodeMessageApprovedEvent.mockReturnValueOnce(messageApprovedEvent);

      const transaction = createMock<TransactionOnNetwork>();
      transaction.hash = 'txHash';
      transaction.sender = Address.newFromBech32('erd1qqqqqqqqqqqqqpgqzqvm5ywqqf524efwrhr039tjs29w0qltkklsa05pk7');

      const result = await service.handleGatewayEvent(rawEvent, transaction, 0, '100');

      expect(gatewayContract.decodeMessageApprovedEvent).toHaveBeenCalledTimes(1);

      expect(result).not.toBeUndefined();
      expect(result?.type).toBe('MESSAGE_APPROVED');

      const event = result as MessageApprovedEventApi;

      expect(event.eventID).toBe('0xtxHash-0');
      expect(event.message.messageID).toBe('messageId');
      expect(event.message.sourceChain).toBe('ethereum');
      expect(event.message.sourceAddress).toBe('sourceAddress');
      expect(event.message.destinationAddress).toBe('erd1qqqqqqqqqqqqqpgqzqvm5ywqqf524efwrhr039tjs29w0qltkklsa05pk7');
      expect(event.message.payloadHash).toBe(BinaryUtils.hexToBase64(contractCallEvent.payloadHash));
      expect(event.cost).toEqual({
        amount: '0',
      });
      expect(event.meta).toEqual({
        txID: 'txHash',
        fromAddress: 'erd1qqqqqqqqqqqqqpgqzqvm5ywqqf524efwrhr039tjs29w0qltkklsa05pk7',
        finalized: true,
      });
    });
  });

  describe('handleMessageExecutedEvent', () => {
    const rawEvent: TransactionEvent = TransactionEvent.fromHttpResponse({
      address: mockGatewayContract,
      identifier: EventIdentifiers.VALIDATE_MESSAGE,
      data: '',
      topics: [
        BinaryUtils.base64Encode(Events.MESSAGE_EXECUTED_EVENT),
        Buffer.from('0c38359b7a35c755573659d797afec315bb0e51374a056745abd9764715a15da', 'hex').toString('base64'),
        BinaryUtils.base64Encode('ethereum'),
        BinaryUtils.base64Encode('messageId'),
      ],
    });

    const transaction = createMock<TransactionOnNetwork>();
    transaction.hash = 'txHash';
    transaction.sender = Address.newFromBech32('erd1qqqqqqqqqqqqqpgqzqvm5ywqqf524efwrhr039tjs29w0qltkklsa05pk7');

    it('Should handle event update contract call approved', async () => {
      const messageApproved: MessageApproved = {
        sourceChain: 'ethereum',
        messageId: 'messageId',
        status: MessageApprovedStatus.PENDING,
        sourceAddress: 'sourceAddress',
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

      const result = await service.handleGatewayEvent(rawEvent, transaction, 0, '100');

      expect(gatewayContract.decodeMessageExecutedEvent).toHaveBeenCalledTimes(1);

      expect(messageApprovedRepository.findBySourceChainAndMessageId).toHaveBeenCalledTimes(1);
      expect(messageApprovedRepository.findBySourceChainAndMessageId).toHaveBeenCalledWith('ethereum', 'messageId');
      expect(messageApprovedRepository.updateStatusAndSuccessTimes).toHaveBeenCalledTimes(1);
      expect(messageApprovedRepository.updateStatusAndSuccessTimes).toHaveBeenCalledWith({
        ...messageApproved,
        status: MessageApprovedStatus.SUCCESS,
        successTimes: 1,
      });

      expect(result).not.toBeUndefined();
      expect(result?.type).toBe('MESSAGE_EXECUTED');

      const event = result as MessageExecutedEventApi;

      expect(event.eventID).toBe('0xtxHash-0');
      expect(event.messageID).toBe('messageId');
      expect(event.sourceChain).toBe('ethereum');
      expect(event.cost).toEqual({
        amount: '100',
      });
      expect(event.meta).toEqual({
        txID: 'txHash',
        fromAddress: 'erd1qqqqqqqqqqqqqpgqzqvm5ywqqf524efwrhr039tjs29w0qltkklsa05pk7',
        finalized: true,
      });
    });

    it('Should handle event no contract call approved', async () => {
      messageApprovedRepository.findBySourceChainAndMessageId.mockReturnValueOnce(Promise.resolve(null));

      const result = await service.handleGatewayEvent(rawEvent, transaction, 0, '100');

      expect(gatewayContract.decodeMessageExecutedEvent).toHaveBeenCalledTimes(1);

      expect(messageApprovedRepository.findBySourceChainAndMessageId).toHaveBeenCalledTimes(1);
      expect(messageApprovedRepository.findBySourceChainAndMessageId).toHaveBeenCalledWith('ethereum', 'messageId');
      expect(messageApprovedRepository.updateManyPartial).not.toHaveBeenCalled();

      expect(result).not.toBeUndefined();
      expect(result?.type).toBe('MESSAGE_EXECUTED');

      const event = result as MessageExecutedEventApi;

      expect(event.eventID).toBe('0xtxHash-0');
      expect(event.messageID).toBe('messageId');
      expect(event.sourceChain).toBe('ethereum');
      expect(event.cost).toEqual({
        amount: '100',
      });
      expect(event.meta).toEqual({
        txID: 'txHash',
        fromAddress: 'erd1qqqqqqqqqqqqqpgqzqvm5ywqqf524efwrhr039tjs29w0qltkklsa05pk7',
        finalized: true,
      });
    });
  });

  describe('handleSignersRotatedEvent', () => {
    const rawEvent: TransactionEvent = TransactionEvent.fromHttpResponse({
      address: mockGatewayContract,
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
    });

    it('Should handle event', async () => {
      gatewayContract.decodeSignersRotatedEvent.mockReturnValueOnce(weightedSigners);

      const result = await service.handleGatewayEvent(rawEvent, createMock(), 0, '100');

      expect(gatewayContract.decodeSignersRotatedEvent).toHaveBeenCalledTimes(1);

      expect(result).toEqual(undefined);
    });
  });
});
