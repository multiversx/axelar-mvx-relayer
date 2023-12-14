import { ApiConfigService } from '@mvx-monorepo/common';
import { createMock, DeepMocked } from '@golevelup/ts-jest';
import { Test } from '@nestjs/testing';
import { BinaryUtils } from '@multiversx/sdk-nestjs-common';
import { EventIdentifiers, Events } from '@mvx-monorepo/common/utils/event.enum';
import { ContractCallEventRepository } from '@mvx-monorepo/common/database/repository/contract-call-event.repository';
import { ContractCallProcessor } from './contract-call.processor';
import { NotifierEvent } from '../event-processor/types';
import { Address } from '@multiversx/sdk-core/out';
import { ContractCallEventStatus } from '@prisma/client';
import { GrpcService } from '@mvx-monorepo/common/grpc/grpc.service';
import { GatewayContract } from '@mvx-monorepo/common/contracts/gateway.contract';
import { ContractCallEvent } from '@mvx-monorepo/common/contracts/entities/contract-call-event';
import { TransactionEvent } from '@multiversx/sdk-network-providers/out';

describe('ContractCallProcessor', () => {
  let gatewayContract: DeepMocked<GatewayContract>;
  let contractCallEventRepository: DeepMocked<ContractCallEventRepository>;
  let grpcService: DeepMocked<GrpcService>;
  let apiConfigService: DeepMocked<ApiConfigService>;

  let service: ContractCallProcessor;

  const event: ContractCallEvent = {
    sender: Address.fromBech32('erd1qqqqqqqqqqqqqpgqzqvm5ywqqf524efwrhr039tjs29w0qltkklsa05pk7'),
    destinationChain: 'ethereum',
    destinationAddress: 'destinationAddress',
    data: {
      payloadHash: 'ebc84cbd75ba5516bf45e7024a9e12bc3c5c880f73e3a5beca7ebba52b2867a7',
      payload: Buffer.from('payload'),
    },
  };

  beforeEach(async () => {
    gatewayContract = createMock();
    contractCallEventRepository = createMock();
    grpcService = createMock();
    apiConfigService = createMock();

    apiConfigService.getSourceChainName.mockReturnValue('multiversx-test');

    const moduleRef = await Test.createTestingModule({
      providers: [ContractCallProcessor],
    })
      .useMocker((token) => {
        if (token === GatewayContract) {
          return gatewayContract;
        }

        if (token === ContractCallEventRepository) {
          return contractCallEventRepository;
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

    gatewayContract.decodeContractCallEvent.mockReturnValue(event);

    service = moduleRef.get(ContractCallProcessor);
  });

  describe('handleEvent', () => {
    const data = Buffer.concat([
      Buffer.from(event.data.payloadHash, 'hex'),
      Buffer.from('00000007', 'hex'), // length of payload as u32
      event.data.payload,
    ]);
    const rawEvent: NotifierEvent = {
      txHash: 'txHash',
      address: 'mockGatewayAddress',
      identifier: 'callContract',
      data: data.toString('base64'),
      topics: [
        BinaryUtils.base64Encode(Events.CONTRACT_CALL_EVENT),
        Buffer.from((event.sender as Address).hex(), 'hex').toString('base64'),
        BinaryUtils.base64Encode(event.destinationChain),
        BinaryUtils.base64Encode(event.destinationAddress),
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

    it('Should not handle event wrong identifier', async () => {
      const rawEvent: NotifierEvent = {
        txHash: 'txHash',
        address: 'mockGatewayAddress',
        identifier: 'any',
        data: data.toString('base64'),
        topics: [BinaryUtils.base64Encode(Events.CONTRACT_CALL_EVENT)],
      };

      await service.handleEvent(rawEvent);

      expect(gatewayContract.decodeContractCallEvent).not.toHaveBeenCalled();
      expect(contractCallEventRepository.create).not.toHaveBeenCalled();
      expect(grpcService.verify).not.toHaveBeenCalled();
    });

    it('Should not handle event wrong event', async () => {
      const rawEvent: NotifierEvent = {
        txHash: 'txHash',
        address: 'mockGatewayAddress',
        identifier: EventIdentifiers.CALL_CONTRACT,
        data: data.toString('base64'),
        topics: [BinaryUtils.base64Encode('any')],
      };

      await service.handleEvent(rawEvent);

      expect(gatewayContract.decodeContractCallEvent).not.toHaveBeenCalled();
      expect(contractCallEventRepository.create).not.toHaveBeenCalled();
      expect(grpcService.verify).not.toHaveBeenCalled();
    });
  });
});
