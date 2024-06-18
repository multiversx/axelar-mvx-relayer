import { Module } from '@nestjs/common';
import { PrismaService } from '@mvx-monorepo/common/database/prisma.service';
import { ContractCallEventRepository } from '@mvx-monorepo/common/database/repository/contract-call-event.repository';
import { GasPaidRepository } from '@mvx-monorepo/common/database/repository/gas-paid.repository';
import { ContractCallApprovedRepository } from '@mvx-monorepo/common/database/repository/contract-call-approved.repository';

@Module({
  providers: [PrismaService, ContractCallEventRepository, GasPaidRepository, ContractCallApprovedRepository],
  exports: [ContractCallEventRepository, GasPaidRepository, ContractCallApprovedRepository],
})
export class DatabaseModule {}
