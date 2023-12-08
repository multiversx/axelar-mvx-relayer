import { Injectable, Logger } from '@nestjs/common';
import { ApiConfigService } from '@mvx-monorepo/common';
import { NotifierBlockEvent, NotifierEvent } from './types';
import { RabbitSubscribe } from '@golevelup/nestjs-rabbitmq';
import { EVENTS_NOTIFIER_QUEUE } from '../../../../config/configuration';
import { ContractCallProcessor, GasServiceProcessor } from '../processors';

@Injectable()
export class EventProcessorService {
  private readonly contractGateway: string;
  private readonly contractGasService: string;
  private readonly logger: Logger;

  constructor(
    private readonly contractCallProcessor: ContractCallProcessor,
    private readonly gasServiceProcessor: GasServiceProcessor,
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
      for (const event of blockEvent.events) {
        await this.handleEvent(event);
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

      await this.contractCallProcessor.handleEvent(event);

      return;
    }
  }
}
