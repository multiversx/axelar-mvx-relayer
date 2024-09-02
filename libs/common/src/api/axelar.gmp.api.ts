import { Inject, Injectable, Logger } from '@nestjs/common';
import { ApiConfigService } from '@mvx-monorepo/common/config';
import { ProviderKeys } from '@mvx-monorepo/common/utils/provider.enum';
import { Client as AxelarGmpApiClient, Components } from '@mvx-monorepo/common/api/entities/axelar.gmp.api';
import { CONSTANTS } from '@mvx-monorepo/common/utils/constants.enum';
import Event = Components.Schemas.Event;
import PublishEventsResult = Components.Schemas.PublishEventsResult;
import PublishEventErrorResult = Components.Schemas.PublishEventErrorResult;

@Injectable()
export class AxelarGmpApi {
  // @ts-ignore
  private readonly axelarContractVotingVerifier: string;
  private readonly logger: Logger;

  constructor(
    @Inject(ProviderKeys.AXELAR_GMP_API_CLIENT) private readonly apiClient: AxelarGmpApiClient,
    apiConfigService: ApiConfigService,
  ) {
    this.axelarContractVotingVerifier = apiConfigService.getAxelarContractVotingVerifier();
    this.logger = new Logger(AxelarGmpApi.name);
  }

  async postEvents(events: Event[], txHash: string) {
    this.logger.debug(`Sending events to Amplifier API for verification`);

    const res = await this.apiClient.post<PublishEventsResult>(`/chains/${CONSTANTS.SOURCE_CHAIN_NAME}/events`, events);

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

        continue;
      }

      this.logger.warn(
        `Failed sending event ${event.type} to GMP API for transaction ${txHash}. Will be retried, error: ${errorResult.error}`,
        result,
      );

      throw new Error('Received retriable event error');
    }
  }

  async getTasks(chain: string, lastUUid?: string | undefined, limit: number = 10) {
    return await this.apiClient.getTasks({
      chain,
      after: lastUUid,
      limit,
    });
  }
}
