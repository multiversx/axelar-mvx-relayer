import { Injectable, Logger } from '@nestjs/common';
import { ApiConfigService } from '@mvx-monorepo/common';
import { NotifierBlockEvent, NotifierEvent } from './types';
import { RabbitSubscribe } from '@golevelup/nestjs-rabbitmq';
import { EVENTS_NOTIFIER_QUEUE } from '../../../../config/configuration';
import { EventIdentifiers, Events } from '@mvx-monorepo/common/utils/event.enum';
import { BinaryUtils } from '@multiversx/sdk-nestjs-common';
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
    this.logger.log('Received event from MultiversX:');
    this.logger.log(JSON.stringify(event));

    if (event.address === this.contractGasService) {
      await this.gasServiceProcessor.handleEvent(event);

      return;
    }

    if (event.address !== this.contractGateway) {
      return;
    }

    if (
      event.identifier === EventIdentifiers.CALL_CONTRACT &&
      BinaryUtils.base64Decode(event.topics[0]) === Events.CONTRACT_CALL_EVENT
    ) {
      this.logger.log('Received callContract event from MultiversX Gateway contract:');
      this.logger.log(JSON.stringify(event));

      await this.contractCallProcessor.handleEvent(event);
    }
  }
}
