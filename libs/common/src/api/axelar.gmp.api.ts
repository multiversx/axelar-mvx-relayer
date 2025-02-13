import { Inject, Injectable, Logger } from '@nestjs/common';
import { ProviderKeys } from '@mvx-monorepo/common/utils/provider.enum';
import { Client as AxelarGmpApiClient, Components } from '@mvx-monorepo/common/api/entities/axelar.gmp.api';
import { CONSTANTS } from '@mvx-monorepo/common/utils/constants.enum';
import { SlackApi } from '@mvx-monorepo/common/api/slack.api';
import Event = Components.Schemas.Event;
import PublishEventsResult = Components.Schemas.PublishEventsResult;
import PublishEventErrorResult = Components.Schemas.PublishEventErrorResult;

@Injectable()
export class AxelarGmpApi {
  private readonly logger: Logger;

  constructor(
    @Inject(ProviderKeys.AXELAR_GMP_API_CLIENT) private readonly apiClient: AxelarGmpApiClient,
    private readonly slackApi: SlackApi,
  ) {
    this.logger = new Logger(AxelarGmpApi.name);
  }

  async postEvents(events: Event[], txHash: string) {
    this.logger.debug(`Sending events to Amplifier API for verification`);

    const res = await this.apiClient.post<PublishEventsResult>(`/chains/${CONSTANTS.SOURCE_CHAIN_NAME}/events`, {
      events,
    });

    if (res.data.results.length !== events.length) {
      throw new Error('Not all events were sent');
    }

    for (const result of res.data.results) {
      if (result.status === 'ACCEPTED') {
        continue;
      }

      const errorResult = result as PublishEventErrorResult;

      const event: Event = events[errorResult.index];

      if (!errorResult.retriable) {
        this.logger.error(
          `Failed sending event ${event.type} to GMP API for transaction ${txHash}. Can NOT be retried, error: ${errorResult.error}`,
          result,
        );
        await this.slackApi.sendError(
          `Axelar GMP API NON-retriable error`,
          `Failed sending event ${event.type} to GMP API for transaction ${txHash}. Can NOT be retried, error: ${errorResult.error}`,
        );

        continue;
      }

      this.logger.warn(
        `Failed sending event ${event.type} to GMP API for transaction ${txHash}. Will be retried, error: ${errorResult.error}`,
        result,
      );
      await this.slackApi.sendWarn(
        `Axelar GMP API retriable error`,
        `Failed sending event ${event.type} to GMP API for transaction ${txHash}. Will be retried, error: ${errorResult.error}`,
      );

      throw new Error(`Received retriable event error`);
    }
  }

  async getTasks(chain: string, lastUUID?: string | undefined, limit: number = 10) {
    return await this.apiClient.getTasks({
      chain,
      after: lastUUID,
      limit,
    });
  }
}
