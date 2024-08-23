import { Injectable, Logger } from '@nestjs/common';
import { ApiConfigService, CacheInfo } from '@mvx-monorepo/common';
import { NotifierBlockEvent, NotifierEvent } from './types';
import { RabbitSubscribe } from '@golevelup/nestjs-rabbitmq';
import { EVENTS_NOTIFIER_QUEUE } from '../../../../config/configuration';
import { GatewayProcessor, GasServiceProcessor } from '../processors';
import { RedisHelper } from '@mvx-monorepo/common/helpers/redis.helper';

@Injectable()
export class EventProcessorService {
  private readonly contractGateway: string;
  private readonly contractGasService: string;
  private readonly logger: Logger;

  constructor(
    private readonly gatewayProcessor: GatewayProcessor,
    private readonly gasServiceProcessor: GasServiceProcessor,
    private readonly redisHelper: RedisHelper,
    apiConfigService: ApiConfigService,
  ) {
    this.contractGateway = apiConfigService.getContractGateway();
    this.contractGasService = apiConfigService.getContractGasService();
    this.logger = new Logger(EventProcessorService.name);
  }

  @RabbitSubscribe({
    queue: EVENTS_NOTIFIER_QUEUE,
    createQueueIfNotExists: false,
  })
  async consumeEvents(blockEvent: NotifierBlockEvent) {
    try {
      const crossChainTransactions = new Set<string>();

      for (const event of blockEvent.events) {
        const txHash = await this.handleEvent(event);

        if (txHash) {
          crossChainTransactions.add(txHash);
        }
      }

      if (crossChainTransactions.size > 0) {
        await this.redisHelper.sadd(CacheInfo.CrossChainTransactions().key, ...crossChainTransactions);
      }
    } catch (error) {
      this.logger.error(
        `An unhandled error occurred when consuming events from block with hash ${blockEvent.hash}: ${JSON.stringify(
          blockEvent.events,
        )}`,
      );
      this.logger.error(error);

      throw error;
    }
  }

  private async handleEvent(event: NotifierEvent) {
    if (event.address === this.contractGasService) {
      this.logger.debug('Received Gas Service event from MultiversX:');
      this.logger.debug(JSON.stringify(event));

      await this.gasServiceProcessor.handleEvent(event);

      return;
    }

    if (event.address === this.contractGateway) {
      this.logger.debug('Received Gateway event from MultiversX:');
      this.logger.debug(JSON.stringify(event));

      return await this.gatewayProcessor.handleEvent(event);
    }

    return undefined;
  }
}
