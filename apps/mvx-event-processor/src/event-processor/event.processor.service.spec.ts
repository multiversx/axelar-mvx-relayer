import { EventProcessorService } from './event.processor.service';
import { ApiConfigService } from '@mvx-monorepo/common';
import { createMock, DeepMocked } from '@golevelup/ts-jest';
import { Test } from '@nestjs/testing';
import { NotifierBlockEvent } from './types';
import { RedisHelper } from '@mvx-monorepo/common/helpers/redis.helper';
import { BinaryUtils } from '@multiversx/sdk-nestjs-common';

describe('EventProcessorService', () => {
  let redisHelper: DeepMocked<RedisHelper>;
  let apiConfigService: DeepMocked<ApiConfigService>;

  let service: EventProcessorService;

  beforeEach(async () => {
    redisHelper = createMock();
    apiConfigService = createMock();

    apiConfigService.getContractGateway.mockReturnValue('mockGatewayAddress');
    apiConfigService.getContractGasService.mockReturnValue('mockGasServiceAddress');

    const moduleRef = await Test.createTestingModule({
      providers: [EventProcessorService],
    })
      .useMocker((token) => {
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
            address: 'mockGatewayAddress',
            identifier: 'callContract',
            data: '',
            topics: [
              BinaryUtils.base64Encode('any'),
            ],
          },
          {
            txHash: 'test',
            address: 'mockGasServiceAddress',
            identifier: 'any',
            data: '',
            topics: [
              BinaryUtils.base64Encode('any'),
            ],
          },
        ],
      };

      await service.consumeEvents(blockEvent);

      expect(apiConfigService.getContractGateway).toHaveBeenCalledTimes(1);
      expect(apiConfigService.getContractGasService).toHaveBeenCalledTimes(1);
      expect(redisHelper.sadd).not.toHaveBeenCalled();
    });

    it('Should consume gateway event', async () => {
      const blockEvent: NotifierBlockEvent = {
        hash: 'test',
        shardId: 1,
        timestamp: 123456,
        events: [
          {
            txHash: 'txHash',
            address: 'mockGatewayAddress',
            identifier: 'callContract',
            data: '',
            topics: [
              BinaryUtils.base64Encode('contract_call_event'),
            ],
          },
          {
            txHash: 'txHash',
            address: 'mockGatewayAddress',
            identifier: 'approveMessages',
            data: '',
            topics: [
              BinaryUtils.base64Encode('message_approved_event'),
            ],
          },
        ],
      };

      await service.consumeEvents(blockEvent);

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
            topics: [
              BinaryUtils.base64Encode('gas_paid_for_contract_call_event'),
            ],
          },
        ],
      };

      await service.consumeEvents(blockEvent);

      expect(redisHelper.sadd).toHaveBeenCalledTimes(1);
      expect(redisHelper.sadd).toHaveBeenCalledWith('crossChainTransactions', 'test');
    });
  });
});
