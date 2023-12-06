import { Module } from '@nestjs/common';
import { PrismaService } from '@mvx-monorepo/common/database/prisma.service';
import { ContractCallEventRepository } from '@mvx-monorepo/common/database/repository/contract-call-event.repository';

@Module({
  providers: [PrismaService, ContractCallEventRepository],
  exports: [ContractCallEventRepository],
})
export class DatabaseModule {}
