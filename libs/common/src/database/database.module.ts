import { Module } from '@nestjs/common';
import { PrismaService } from '@mvx-monorepo/common/database/prisma.service';
import { ContractCallEventRepository } from '@mvx-monorepo/common/database/repository/contract-call-event.repository';
import { GasPaidRepository } from '@mvx-monorepo/common/database/repository/gas-paid.repository';

@Module({
  providers: [PrismaService, ContractCallEventRepository, GasPaidRepository],
  exports: [ContractCallEventRepository, GasPaidRepository],
})
export class DatabaseModule {}
