import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { Locker } from '@multiversx/sdk-nestjs-common';
import { ContractCallEventStatus } from '@prisma/client';
import { GrpcService } from '@mvx-monorepo/common';
import { ContractCallEventRepository } from '@mvx-monorepo/common/database/repository/contract-call-event.repository';
import { firstValueFrom } from 'rxjs';

@Injectable()
export class ContractCallEventProcessorService {
  private readonly logger: Logger;

  constructor(
    private readonly contractCallEventRepository: ContractCallEventRepository,
    private readonly grpcService: GrpcService,
  ) {
    this.logger = new Logger(ContractCallEventProcessorService.name);
  }

  @Cron('15 */2 * * * *')
  async processPendingContractCallEvent() {
    await Locker.lock('processPendingContractCallEvent', async () => {
      this.logger.debug('Running processPendingContractCallEvent cron');

      let page = 0;
      let entries;
      while ((entries = await this.contractCallEventRepository.findPending(page))?.length) {
        this.logger.log(`Found ${entries.length} ContractCallEvent transactions to execute`);

        for (const contractCallEvent of entries) {
          this.logger.debug(`Trying to verify ContractCallEvent with id ${contractCallEvent.id}`);

          try {
            const value = await firstValueFrom(this.grpcService.verify(contractCallEvent));

            if (value.success) {
              contractCallEvent.status = ContractCallEventStatus.APPROVED;
            } else {
              contractCallEvent.status = ContractCallEventStatus.FAILED;

              this.logger.error(`Verify contract call event ${contractCallEvent.id} was not successful`);
            }
          } catch (e) {
            this.logger.error(`Could not verify contract call event ${contractCallEvent.id}`);
            this.logger.error(e);

            contractCallEvent.status = ContractCallEventStatus.FAILED;
          }

          await this.contractCallEventRepository.updateStatus(contractCallEvent);
        }

        page++;
      }
    });
  }
}
