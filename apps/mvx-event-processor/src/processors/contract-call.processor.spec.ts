import { ApiConfigService } from '@mvx-monorepo/common';
import { createMock, DeepMocked } from '@golevelup/ts-jest';
import { Test } from '@nestjs/testing';
import { BinaryUtils } from '@multiversx/sdk-nestjs-common';
import { Events } from '@mvx-monorepo/common/utils/event.enum';
import { ContractCallEventRepository } from '@mvx-monorepo/common/database/repository/contract-call-event.repository';
import { ContractCallProcessor } from './contract-call.processor';
import { NotifierEvent } from '../event-processor/types';
import { ContractsModule } from '@mvx-monorepo/common/contracts/contracts.module';
import { Address } from '@multiversx/sdk-core/out';
import { ContractCallEventStatus } from '@prisma/client';
import { GrpcService } from '@mvx-monorepo/common/grpc/grpc.service';

describe('ContractCallProcessor', () => {
  let contractCallEventRepository: DeepMocked<ContractCallEventRepository>;
  let apiConfigService: DeepMocked<ApiConfigService>;
  let grpcService: DeepMocked<GrpcService>;

  let service: ContractCallProcessor;

  beforeEach(async () => {
    contractCallEventRepository = createMock();
    apiConfigService = createMock();
    grpcService = createMock();

    apiConfigService.getSourceChainName.mockReturnValue('multiversx-test');
    apiConfigService.getContractGateway.mockReturnValue(
      'erd1qqqqqqqqqqqqqpgqsvzyz88e8v8j6x3wquatxuztnxjwnw92kkls6rdtzx',
    );

    const moduleRef = await Test.createTestingModule({
      imports: [ContractsModule], // it uses real GatewayContract object loaded from abi
      providers: [ContractCallProcessor],
    })
      .useMocker((token) => {
        if (token === ContractCallEventRepository) {
          return contractCallEventRepository;
        }

        if (token === ApiConfigService) {
          return apiConfigService;
        }

        if (token === GrpcService) {
          return grpcService;
        }

        return null;
      })
      .compile();

    service = moduleRef.get(ContractCallProcessor);
  });

  describe('handleEvent', () => {
    const data = Buffer.concat([
      Buffer.from('ebc84cbd75ba5516bf45e7024a9e12bc3c5c880f73e3a5beca7ebba52b2867a7', 'hex'),
      Buffer.from('00000007', 'hex'), // length of payload as u32
      Buffer.from('payload'),
    ]);
    const rawEvent: NotifierEvent = {
      txHash: 'txHash',
      address: 'mockGatewayAddress',
      identifier: 'callContract',
      data: data.toString('base64'),
      topics: [
        BinaryUtils.base64Encode(Events.CONTRACT_CALL_EVENT),
        Buffer.from(
          Address.fromBech32('erd1qqqqqqqqqqqqqpgqzqvm5ywqqf524efwrhr039tjs29w0qltkklsa05pk7').hex(),
          'hex',
        ).toString('base64'),
        BinaryUtils.base64Encode('ethereum'),
        BinaryUtils.base64Encode('destinationAddress'),
      ],
      order: 1,
    };

    it('Should handle event', async () => {
      await service.handleEvent(rawEvent);

      expect(contractCallEventRepository.create).toHaveBeenCalledTimes(1);
      expect(contractCallEventRepository.create).toHaveBeenCalledWith({
        id: 'multiversx-test:txHash:1',
        txHash: 'txHash',
        eventIndex: 1,
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

      expect(contractCallEventRepository.create).toHaveBeenCalledTimes(1);
      expect(grpcService.verify).not.toHaveBeenCalled();
    });
  });
});
