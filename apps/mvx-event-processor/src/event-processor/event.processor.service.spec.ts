import { EventProcessorService } from './event.processor.service';
import { ApiConfigService } from '@mvx-monorepo/common';
import { createMock, DeepMocked } from '@golevelup/ts-jest';
import { Test } from '@nestjs/testing';
import { NotifierBlockEvent } from './types';
import { GasServiceProcessor, GatewayProcessor } from '../processors';
import { RedisHelper } from '@mvx-monorepo/common/helpers/redis.helper';

describe('EventProcessorService', () => {
  let gatewayProcessor: DeepMocked<GatewayProcessor>;
  let gasServiceProcessor: DeepMocked<GasServiceProcessor>;
  let redisHelper: DeepMocked<RedisHelper>;
  let apiConfigService: DeepMocked<ApiConfigService>;

  let service: EventProcessorService;

  beforeEach(async () => {
    gatewayProcessor = createMock();
    gasServiceProcessor = createMock();
    redisHelper = createMock();
    apiConfigService = createMock();

    apiConfigService.getContractGateway.mockReturnValue('mockGatewayAddress');
    apiConfigService.getContractGasService.mockReturnValue('mockGasServiceAddress');

    const moduleRef = await Test.createTestingModule({
      providers: [EventProcessorService],
    })
      .useMocker((token) => {
        if (token === GatewayProcessor) {
          return gatewayProcessor;
        }

        if (token === GasServiceProcessor) {
          return gasServiceProcessor;
        }

        if (token === RedisHelper) {
          return redisHelper;
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
            identifier: 'callContract',
            data: '',
            topics: [],
          },
          {
            txHash: 'test',
            address: 'someOtherAddress',
            identifier: 'any',
            data: '',
            topics: [],
          },
        ],
      };

      await service.consumeEvents(blockEvent);

      expect(apiConfigService.getContractGateway).toHaveBeenCalledTimes(1);
      expect(gatewayProcessor.handleEvent).not.toHaveBeenCalled();
      expect(gasServiceProcessor.handleEvent).not.toHaveBeenCalled();
      expect(redisHelper.sadd).not.toHaveBeenCalled();
    });

    it('Should consume gateway event', async () => {
      gatewayProcessor.handleEvent.mockReturnValue(Promise.resolve('txHash'));

      const blockEvent: NotifierBlockEvent = {
        hash: 'test',
        shardId: 1,
        timestamp: 123456,
        events: [
          {
            txHash: 'txHash',
            address: 'mockGatewayAddress',
            identifier: 'any',
            data: '',
            topics: [],
          },
          {
            txHash: 'txHash',
            address: 'mockGatewayAddress',
            identifier: 'any',
            data: '',
            topics: [],
          },
        ],
      };

      await service.consumeEvents(blockEvent);

      expect(apiConfigService.getContractGateway).toHaveBeenCalledTimes(1);
      expect(gatewayProcessor.handleEvent).toHaveBeenCalledTimes(2);
      expect(gasServiceProcessor.handleEvent).not.toHaveBeenCalled();
      expect(redisHelper.sadd).toHaveBeenCalledTimes(1);
      expect(redisHelper.sadd).toHaveBeenCalledWith('crossChainTransactions', 'txHash');
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
            identifier: 'any',
            data: '',
            topics: [],
          },
        ],
      };

      await service.consumeEvents(blockEvent);

      expect(apiConfigService.getContractGateway).toHaveBeenCalledTimes(1);
      expect(gasServiceProcessor.handleEvent).toHaveBeenCalledTimes(1);
      expect(gatewayProcessor.handleEvent).not.toHaveBeenCalled();
      expect(redisHelper.sadd).not.toHaveBeenCalled();
    });
  });
});
