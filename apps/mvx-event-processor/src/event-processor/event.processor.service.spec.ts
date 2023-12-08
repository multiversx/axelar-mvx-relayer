import { EventProcessorService } from './event.processor.service';
import { ApiConfigService } from '@mvx-monorepo/common';
import { createMock, DeepMocked } from '@golevelup/ts-jest';
import { Test } from '@nestjs/testing';
import { NotifierBlockEvent } from './types';
import { BinaryUtils } from '@multiversx/sdk-nestjs-common';
import { Events } from '@mvx-monorepo/common/utils/event.enum';
import { ContractCallProcessor, GasServiceProcessor } from '../processors';

describe('EventProcessorService', () => {
  let contractCallProcessor: DeepMocked<ContractCallProcessor>;
  let gasServiceProcessor: DeepMocked<GasServiceProcessor>;
  let apiConfigService: DeepMocked<ApiConfigService>;

  let service: EventProcessorService;

  beforeEach(async () => {
    contractCallProcessor = createMock();
    gasServiceProcessor = createMock();
    apiConfigService = createMock();

    apiConfigService.getContractGateway.mockReturnValue('mockGatewayAddress');
    apiConfigService.getContractGasService.mockReturnValue('mockGasServiceAddress');

    const moduleRef = await Test.createTestingModule({
      providers: [EventProcessorService],
    })
      .useMocker((token) => {
        if (token === ContractCallProcessor) {
          return contractCallProcessor;
        }

        if (token === GasServiceProcessor) {
          return gasServiceProcessor;
        }

        if (token === ApiConfigService) {
          return apiConfigService;
        }

        return null;
      })
      .compile();

    service = moduleRef.get(EventProcessorService);
  });

  describe('consumeEvents', () => {
    it('Should not consume events', async () => {
      const blockEvent: NotifierBlockEvent = {
        hash: 'test',
        shardId: 1,
        timestamp: 123456,
        events: [
          {
            txHash: 'test',
            address: 'someAddress',
            identifier: 'someIdentifier',
            data: '',
            topics: [],
            order: 0,
          },
          {
            txHash: 'test',
            address: 'mockGatewayAddress',
            identifier: 'someIdentifier',
            data: '',
            topics: [BinaryUtils.base64Encode(Events.CONTRACT_CALL_EVENT)],
            order: 0,
          },
          {
            txHash: 'test',
            address: 'mockGatewayAddress',
            identifier: 'callContract',
            data: '',
            topics: [''],
            order: 0,
          },
        ],
      };

      await service.consumeEvents(blockEvent);

      expect(apiConfigService.getContractGateway).toHaveBeenCalledTimes(1);
      expect(contractCallProcessor.handleEvent).not.toHaveBeenCalled();
      expect(gasServiceProcessor.handleEvent).not.toHaveBeenCalled();
    });

    it('Should consume gateway event', async () => {
      const blockEvent: NotifierBlockEvent = {
        hash: 'test',
        shardId: 1,
        timestamp: 123456,
        events: [
          {
            txHash: 'test',
            address: 'mockGatewayAddress',
            identifier: 'callContract',
            data: '',
            topics: [BinaryUtils.base64Encode(Events.CONTRACT_CALL_EVENT)],
            order: 0,
          },
        ],
      };

      await service.consumeEvents(blockEvent);

      expect(apiConfigService.getContractGateway).toHaveBeenCalledTimes(1);
      expect(contractCallProcessor.handleEvent).toHaveBeenCalledTimes(1);
      expect(gasServiceProcessor.handleEvent).not.toHaveBeenCalled();
    });

    it('Should consume gas contract event', async () => {
      const blockEvent: NotifierBlockEvent = {
        hash: 'test',
        shardId: 1,
        timestamp: 123456,
        events: [
          {
            txHash: 'test',
            address: 'mockGasServiceAddress',
            identifier: 'payGasForContractCall',
            data: '',
            topics: [BinaryUtils.base64Encode(Events.GAS_PAID_FOR_CONTRACT_CALL_EVENT)],
            order: 0,
          },
        ],
      };

      await service.consumeEvents(blockEvent);

      expect(apiConfigService.getContractGateway).toHaveBeenCalledTimes(1);
      expect(gasServiceProcessor.handleEvent).toHaveBeenCalledTimes(1);
      expect(contractCallProcessor.handleEvent).not.toHaveBeenCalled();
    });

    it('Should throw error', async () => {
      const blockEvent: NotifierBlockEvent = {
        hash: 'test',
        shardId: 1,
        timestamp: 123456,
        events: [
          {
            txHash: 'test',
            address: 'mockGatewayAddress',
            identifier: 'callContract',
            data: '',
            topics: [],
            order: 0,
          },
        ],
      };

      await expect(service.consumeEvents(blockEvent)).rejects.toThrow();

      expect(apiConfigService.getContractGateway).toHaveBeenCalledTimes(1);
      expect(contractCallProcessor.handleEvent).not.toHaveBeenCalled();
    });
  });
});
