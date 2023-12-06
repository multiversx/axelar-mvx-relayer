import { Injectable } from '@nestjs/common';
import { PrismaService } from '@mvx-monorepo/common/database/prisma.service';
import { ContractCallEvent, Prisma } from '@prisma/client';

@Injectable()
export class ContractCallEventRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(data: Prisma.ContractCallEventCreateInput): Promise<ContractCallEvent | null> {
    return this.prisma.contractCallEvent.create({
      data,
    });
  }
}
