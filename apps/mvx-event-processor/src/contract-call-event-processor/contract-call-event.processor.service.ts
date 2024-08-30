import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { Locker } from '@multiversx/sdk-nestjs-common';
import { ContractCallEventStatus } from '@prisma/client';
import { AxelarGmpApi } from '@mvx-monorepo/common';
import { ContractCallEventRepository } from '@mvx-monorepo/common/database/repository/contract-call-event.repository';

const MAX_NUMBER_OF_RETRIES: number = 3;

@Injectable()
export class ContractCallEventProcessorService {
  private readonly logger: Logger;

  constructor(
    private readonly contractCallEventRepository: ContractCallEventRepository,
    private readonly grpcService: AxelarGmpApi,
  ) {
    this.logger = new Logger(ContractCallEventProcessorService.name);
  }

  // Offset at second 15 to not run at the same time as processPendingMessageApproved
  @Cron('15 */2 * * * *')
  async processPendingContractCallEvent() {
    await Locker.lock('processPendingContractCallEvent', async () => {
      this.logger.debug('Running processPendingContractCallEvent cron');

      let page = 0;
      let entries;
      while ((entries = await this.contractCallEventRepository.findPending(page))?.length) {
        this.logger.log(`Found ${entries.length} ContractCallEvent transactions to execute`);

        for (const contractCallEvent of entries) {
          if (contractCallEvent.retry === MAX_NUMBER_OF_RETRIES) {
            this.logger.error(
              `Could not verify contract call event ${contractCallEvent.id} after ${contractCallEvent.retry} retries`,
            );

            await this.contractCallEventRepository.updateStatus(contractCallEvent.id, ContractCallEventStatus.FAILED);

            continue;
          }

          contractCallEvent.retry += 1;

          this.logger.debug(`Trying to verify ContractCallEvent with id ${contractCallEvent.id}, retry ${contractCallEvent.retry}}`);

          await this.contractCallEventRepository.updateRetry(contractCallEvent.id, contractCallEvent.retry);

          this.grpcService.sendEventCall(contractCallEvent);
        }

        page++;
      }
    });
  }
}
