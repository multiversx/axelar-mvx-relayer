import { ApiConfigService } from '@mvx-monorepo/common';
import { createMock, DeepMocked } from '@golevelup/ts-jest';
import { Test } from '@nestjs/testing';
import { BinaryUtils } from '@multiversx/sdk-nestjs-common';
import { EventIdentifiers, Events } from '@mvx-monorepo/common/utils/event.enum';
import { ContractCallEventRepository } from '@mvx-monorepo/common/database/repository/contract-call-event.repository';
import { GatewayProcessor } from './gateway.processor';
import { NotifierEvent } from '../event-processor/types';
import { Address } from '@multiversx/sdk-core/out';
import { ContractCallApproved, ContractCallApprovedStatus, ContractCallEventStatus } from '@prisma/client';
import { GrpcService } from '@mvx-monorepo/common/grpc/grpc.service';
import { GatewayContract } from '@mvx-monorepo/common/contracts/gateway.contract';
import { ContractCallApprovedEvent, ContractCallEvent } from '@mvx-monorepo/common/contracts/entities/gateway-events';
import { TransactionEvent } from '@multiversx/sdk-network-providers/out';
import { ContractCallApprovedRepository } from '@mvx-monorepo/common/database/repository/contract-call-approved.repository';

describe('ContractCallProcessor', () => {
  let gatewayContract: DeepMocked<GatewayContract>;
  let contractCallEventRepository: DeepMocked<ContractCallEventRepository>;
  let contractCallApprovedRepository: DeepMocked<ContractCallApprovedRepository>;
  let grpcService: DeepMocked<GrpcService>;
  let apiConfigService: DeepMocked<ApiConfigService>;

  let service: GatewayProcessor;

  const contractCallEvent: ContractCallEvent = {
    sender: Address.fromBech32('erd1qqqqqqqqqqqqqpgqzqvm5ywqqf524efwrhr039tjs29w0qltkklsa05pk7'),
    destinationChain: 'ethereum',
    destinationAddress: 'destinationAddress',
    data: {
      payloadHash: 'ebc84cbd75ba5516bf45e7024a9e12bc3c5c880f73e3a5beca7ebba52b2867a7',
      payload: Buffer.from('payload'),
    },
  };
  const contractCallApprovedEvent: ContractCallApprovedEvent = {
    commandId: '0c38359b7a35c755573659d797afec315bb0e51374a056745abd9764715a15da',
    sourceChain: 'ethereum',
    sourceAddress: 'sourceAddress',
    contractAddress: Address.fromBech32('erd1qqqqqqqqqqqqqpgqzqvm5ywqqf524efwrhr039tjs29w0qltkklsa05pk7'),
    payloadHash: 'ebc84cbd75ba5516bf45e7024a9e12bc3c5c880f73e3a5beca7ebba52b2867a7',
  };

  beforeEach(async () => {
    gatewayContract = createMock();
    contractCallEventRepository = createMock();
    contractCallApprovedRepository = createMock();
    grpcService = createMock();
    apiConfigService = createMock();

    apiConfigService.getSourceChainName.mockReturnValue('multiversx-test');

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

        if (token === ContractCallApprovedRepository) {
          return contractCallApprovedRepository;
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
    gatewayContract.decodeContractCallApprovedEvent.mockReturnValue(contractCallApprovedEvent);
    gatewayContract.decodeContractCallExecutedEvent.mockReturnValue(contractCallApprovedEvent.commandId);

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
    expect(gatewayContract.decodeContractCallApprovedEvent).not.toHaveBeenCalled();
    expect(contractCallEventRepository.create).not.toHaveBeenCalled();
    expect(contractCallApprovedRepository.create).not.toHaveBeenCalled();
    expect(grpcService.verify).not.toHaveBeenCalled();
    expect(grpcService.getPayload).not.toHaveBeenCalled();
  });

  describe('handleContractCallEvent', () => {
    const data = Buffer.concat([
      Buffer.from(contractCallEvent.data.payloadHash, 'hex'),
      Buffer.from('00000007', 'hex'), // length of payload as u32
      contractCallEvent.data.payload,
    ]);
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
      ],
    };

    it('Should handle event', async () => {
      await service.handleEvent(rawEvent);

      expect(gatewayContract.decodeContractCallEvent).toHaveBeenCalledTimes(1);
      expect(gatewayContract.decodeContractCallEvent).toHaveBeenCalledWith(TransactionEvent.fromHttpResponse(rawEvent));
      expect(contractCallEventRepository.create).toHaveBeenCalledTimes(1);
      expect(contractCallEventRepository.create).toHaveBeenCalledWith({
        id: 'multiversx-test:txHash:999999',
        txHash: 'txHash',
        eventIndex: 999999,
        status: ContractCallEventStatus.PENDING,
        sourceAddress: 'erd1qqqqqqqqqqqqqpgqzqvm5ywqqf524efwrhr039tjs29w0qltkklsa05pk7',
        sourceChain: 'multiversx-test',
        destinationAddress: 'destinationAddress',
        destinationChain: 'ethereum',
        payloadHash: 'ebc84cbd75ba5516bf45e7024a9e12bc3c5c880f73e3a5beca7ebba52b2867a7',
        payload: Buffer.from('payload'),
      });
      expect(grpcService.verify).toHaveBeenCalledTimes(1);
    });

    it('Should throw error can not save in database', async () => {
      contractCallEventRepository.create.mockReturnValueOnce(Promise.resolve(null));

      await expect(service.handleEvent(rawEvent)).rejects.toThrow();

      expect(gatewayContract.decodeContractCallEvent).toHaveBeenCalledTimes(1);
      expect(gatewayContract.decodeContractCallEvent).toHaveBeenCalledWith(TransactionEvent.fromHttpResponse(rawEvent));
      expect(contractCallEventRepository.create).toHaveBeenCalledTimes(1);
      expect(grpcService.verify).not.toHaveBeenCalled();
    });
  });

  describe('handleContractCallApprovedEvent', () => {
    const rawEvent: NotifierEvent = {
      txHash: 'txHash',
      address: 'mockGatewayAddress',
      identifier: EventIdentifiers.EXECUTE,
      data: '',
      topics: [
        BinaryUtils.base64Encode(Events.CONTRACT_CALL_APPROVED_EVENT),
        Buffer.from('0c38359b7a35c755573659d797afec315bb0e51374a056745abd9764715a15da', 'hex').toString('base64'),
        BinaryUtils.base64Encode('ethereum'),
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

      expect(gatewayContract.decodeContractCallApprovedEvent).toHaveBeenCalledTimes(1);
      expect(gatewayContract.decodeContractCallApprovedEvent).toHaveBeenCalledWith(
        TransactionEvent.fromHttpResponse(rawEvent),
      );
      expect(grpcService.getPayload).toHaveBeenCalledTimes(1);
      expect(grpcService.getPayload).toHaveBeenCalledWith(contractCallApprovedEvent.payloadHash);
      expect(contractCallApprovedRepository.create).toHaveBeenCalledTimes(1);
      expect(contractCallApprovedRepository.create).toHaveBeenCalledWith({
        commandId: '0c38359b7a35c755573659d797afec315bb0e51374a056745abd9764715a15da',
        txHash: 'txHash',
        status: ContractCallApprovedStatus.PENDING,
        sourceAddress: 'sourceAddress',
        sourceChain: 'ethereum',
        contractAddress: 'erd1qqqqqqqqqqqqqpgqzqvm5ywqqf524efwrhr039tjs29w0qltkklsa05pk7',
        payloadHash: 'ebc84cbd75ba5516bf45e7024a9e12bc3c5c880f73e3a5beca7ebba52b2867a7',
        payload: Buffer.from('payload'),
        retry: 0,
      });
    });

    it('Should throw error can not save in database', async () => {
      grpcService.getPayload.mockReturnValueOnce(Promise.resolve(Buffer.from('payload')));

      contractCallApprovedRepository.create.mockReturnValueOnce(Promise.resolve(null));

      await expect(service.handleEvent(rawEvent)).rejects.toThrow();

      expect(gatewayContract.decodeContractCallApprovedEvent).toHaveBeenCalledTimes(1);
      expect(gatewayContract.decodeContractCallApprovedEvent).toHaveBeenCalledWith(
        TransactionEvent.fromHttpResponse(rawEvent),
      );
      expect(grpcService.getPayload).toHaveBeenCalledTimes(1);
      expect(grpcService.getPayload).toHaveBeenCalledWith(contractCallApprovedEvent.payloadHash);
      expect(contractCallApprovedRepository.create).toHaveBeenCalledTimes(1);
    });
  });

  describe('handleContractCallExecutedEvent', () => {
    const rawEvent: NotifierEvent = {
      txHash: 'txHash',
      address: 'mockGatewayAddress',
      identifier: EventIdentifiers.VALIDATE_CONTRACT_CALL,
      data: '',
      topics: [
        BinaryUtils.base64Encode(Events.CONTRACT_CALL_EXECUTED_EVENT),
        Buffer.from('0c38359b7a35c755573659d797afec315bb0e51374a056745abd9764715a15da', 'hex').toString('base64'),
      ],
    };

    it('Should handle event update contract call approved', async () => {
      const contractCallApproved: ContractCallApproved = {
        commandId: '0c38359b7a35c755573659d797afec315bb0e51374a056745abd9764715a15da',
        txHash: 'txHash',
        status: ContractCallApprovedStatus.PENDING,
        sourceAddress: 'sourceAddress',
        sourceChain: 'ethereum',
        contractAddress: 'erd1qqqqqqqqqqqqqpgqzqvm5ywqqf524efwrhr039tjs29w0qltkklsa05pk7',
        payloadHash: 'ebc84cbd75ba5516bf45e7024a9e12bc3c5c880f73e3a5beca7ebba52b2867a7',
        payload: Buffer.from('payload'),
        retry: 0,
        executeTxHash: null,
        updatedAt: new Date(),
        createdAt: new Date(),
      };

      contractCallApprovedRepository.findByCommandId.mockReturnValueOnce(Promise.resolve(contractCallApproved));

      await service.handleEvent(rawEvent);

      expect(gatewayContract.decodeContractCallExecutedEvent).toHaveBeenCalledTimes(1);
      expect(gatewayContract.decodeContractCallExecutedEvent).toHaveBeenCalledWith(
        TransactionEvent.fromHttpResponse(rawEvent),
      );
      expect(contractCallApprovedRepository.findByCommandId).toHaveBeenCalledTimes(1);
      expect(contractCallApprovedRepository.findByCommandId).toHaveBeenCalledWith(
        '0c38359b7a35c755573659d797afec315bb0e51374a056745abd9764715a15da',
      );
      expect(contractCallApprovedRepository.updateManyStatusRetryExecuteTxHash).toHaveBeenCalledTimes(1);
      expect(contractCallApprovedRepository.updateManyStatusRetryExecuteTxHash).toHaveBeenCalledWith([
        {
          ...contractCallApproved,
          status: ContractCallApprovedStatus.SUCCESS,
        },
      ]);
    });

    it('Should handle event no contract call approved', async () => {
      contractCallApprovedRepository.findByCommandId.mockReturnValueOnce(Promise.resolve(null));

      await service.handleEvent(rawEvent);

      expect(gatewayContract.decodeContractCallExecutedEvent).toHaveBeenCalledTimes(1);
      expect(gatewayContract.decodeContractCallExecutedEvent).toHaveBeenCalledWith(
        TransactionEvent.fromHttpResponse(rawEvent),
      );
      expect(contractCallApprovedRepository.findByCommandId).toHaveBeenCalledTimes(1);
      expect(contractCallApprovedRepository.findByCommandId).toHaveBeenCalledWith(
        '0c38359b7a35c755573659d797afec315bb0e51374a056745abd9764715a15da',
      );
      expect(contractCallApprovedRepository.updateManyStatusRetryExecuteTxHash).not.toHaveBeenCalled();
    });
  });
});