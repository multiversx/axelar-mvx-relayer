import { EventProcessorService } from './event.processor.service';
import { ApiConfigService } from '@mvx-monorepo/common';
import { createMock, DeepMocked } from '@golevelup/ts-jest';
import { ContractCallProcessor } from '../processors/contract-call.processor';
import { Test } from '@nestjs/testing';
import { NotifierBlockEvent } from './types';
import { BinaryUtils } from '@multiversx/sdk-nestjs-common';
import { Events } from '@mvx-monorepo/common/utils/event.enum';

describe('EventProcessorService', () => {
  let apiConfigService: DeepMocked<ApiConfigService>;
  let contractCallProcessor: DeepMocked<ContractCallProcessor>;

  let service: EventProcessorService;

  beforeEach(async () => {
    apiConfigService = createMock();
    contractCallProcessor = createMock();

    apiConfigService.getContractGateway.mockReturnValue('mockGatewayAddress');

    const moduleRef = await Test.createTestingModule({
      providers: [EventProcessorService],
    })
      .useMocker((token) => {
        if (token === ApiConfigService) {
          return apiConfigService;
        }

        if (token === ContractCallProcessor) {
          return contractCallProcessor;
        }

        return undefined;
      })
      .compile();

    service = moduleRef.get(EventProcessorService);
  });

  describe('consumeEvents', () => {
    it('Should not consume event', async () => {
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

      expect(apiConfigService.getContractGateway).toHaveBeenCalledTimes(3);
      expect(contractCallProcessor.handleEvent).not.toHaveBeenCalled();
    });

    it('Should consume event', async () => {
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
