import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { ContractsModule } from '@mvx-monorepo/common/contracts/contracts.module';
import { GasCheckerService } from './gas-checker.service';

@Module({
  imports: [ScheduleModule.forRoot(), ContractsModule],
  providers: [GasCheckerService],
})
export class GasCheckerModule {}
