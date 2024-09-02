import { Inject, Injectable, Logger } from '@nestjs/common';
import { ContractCallEventStatus } from '@prisma/client';
import { ApiConfigService } from '@mvx-monorepo/common/config';
import { ContractCallEventRepository } from '@mvx-monorepo/common/database/repository/contract-call-event.repository';
import { ProviderKeys } from '@mvx-monorepo/common/utils/provider.enum';
import { Client as AxelarGmpApiClient, Components } from '@mvx-monorepo/common/api/entities/axelar.gmp.api';
import { CONSTANTS } from '@mvx-monorepo/common/utils/constants.enum';
import Event = Components.Schemas.Event;
import PublishEventsResult = Components.Schemas.PublishEventsResult;
import PublishEventErrorResult = Components.Schemas.PublishEventErrorResult;
import PublishEventAcceptedResult = Components.Schemas.PublishEventAcceptedResult;

@Injectable()
export class AxelarGmpApi {
  // @ts-ignore
  private readonly axelarContractVotingVerifier: string;
  private readonly logger: Logger;

  constructor(
    @Inject(ProviderKeys.AXELAR_GMP_API_CLIENT) private readonly apiClient: AxelarGmpApiClient,
    private readonly contractCallEventRepository: ContractCallEventRepository,
    apiConfigService: ApiConfigService,
  ) {
    this.axelarContractVotingVerifier = apiConfigService.getAxelarContractVotingVerifier();
    this.logger = new Logger(AxelarGmpApi.name);
  }

  async postEvents(events: Event[]) {
    this.logger.debug(`Sending events to Amplifier API for verification`);

    try {
      const res = await this.apiClient.post<PublishEventsResult>(
        `/chains/${CONSTANTS.SOURCE_CHAIN_NAME}/events`,
        events,
      );

      for (const result of res.data.results) {
        if (result.status === 'ACCEPTED') {
          const acceptedResult = result as PublishEventAcceptedResult;

          const event = events[acceptedResult.index];

          this.logger.debug(`Successfully verified contract call event ${event.eventID}!`);

          await this.contractCallEventRepository.updateStatus(event.eventID, ContractCallEventStatus.APPROVED);

          continue;
        }

        const errorResult = result as PublishEventErrorResult;

        const event = events[errorResult.index];

        if (!errorResult.retriable) {
          this.logger.error(
            `Verify contract call event ${event.eventID} was not successful. Can NOT be retried, error: ${errorResult.error}`,
            result,
          );

          await this.contractCallEventRepository.updateStatus(event.eventID, ContractCallEventStatus.FAILED);

          continue;
        }

        this.logger.warn(
          `Verify contract call event ${event.eventID} was not successful. Will be retried, error: ${errorResult.error}`,
          result,
        );

        // TODO: Handle retry of some events
      }
    } catch (e) {
      this.logger.error('Could not send event call to Axelar... Will be retried', e);
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
