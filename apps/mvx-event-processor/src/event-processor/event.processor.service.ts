import { Injectable, Logger } from '@nestjs/common';
import { ApiConfigService } from '@mvx-monorepo/common';
import { NotifierBlockEvent, NotifierEvent } from './types';
import { RabbitSubscribe } from '@golevelup/nestjs-rabbitmq';
import configuration from '../../config/configuration';

@Injectable()
export class EventProcessorService {
  private readonly logger: Logger;

  constructor(private readonly apiConfigService: ApiConfigService) {
    this.logger = new Logger(EventProcessorService.name);
  }

  @RabbitSubscribe({
    queue: configuration().eventsNotifier.queue,
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

  // TODO: Implement logic
  private handleEvent(event: NotifierEvent) {
    this.logger.log('Received event from MultiversX Gateway contract:');
    this.logger.log(JSON.stringify(event));

    if (event.address !== this.apiConfigService.getEventsNotifierGatewayAddress()) {
      return;
    }

    if (event.identifier === 'callContract') {
      this.logger.log('Received callContract event from MultiversX Gateway contract:');
      this.logger.log(JSON.stringify(event));
    }
  }
}
