import { Module } from '@nestjs/common';
import { PrismaService } from '@mvx-monorepo/common/database/prisma.service';
import { ContractCallEventRepository } from '@mvx-monorepo/common/database/repository/contract-call-event.repository';
import { GasPaidRepository } from '@mvx-monorepo/common/database/repository/gas-paid.repository';
import { MessageApprovedRepository } from '@mvx-monorepo/common/database/repository/message-approved.repository';

@Module({
  providers: [PrismaService, ContractCallEventRepository, GasPaidRepository, MessageApprovedRepository],
  exports: [ContractCallEventRepository, GasPaidRepository, MessageApprovedRepository],
})
export class DatabaseModule {}
