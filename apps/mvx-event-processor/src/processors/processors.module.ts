import { Module } from '@nestjs/common';
import { ContractCallProcessor } from './contract-call.processor';
import { ContractsModule } from '@mvx-monorepo/common/contracts/contracts.module';
import { DatabaseModule } from '@mvx-monorepo/common';

@Module({
  imports: [ContractsModule, DatabaseModule],
  providers: [ContractCallProcessor],
  exports: [ContractCallProcessor],
})
export class ProcessorsModule {}
