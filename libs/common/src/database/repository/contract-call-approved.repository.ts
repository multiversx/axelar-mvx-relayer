import { Injectable } from '@nestjs/common';
import { PrismaService } from '@mvx-monorepo/common/database/prisma.service';
import { ContractCallApproved, Prisma } from '@prisma/client';

@Injectable()
export class ContractCallApprovedRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(data: Prisma.ContractCallApprovedCreateInput): Promise<ContractCallApproved | null> {
    return this.prisma.contractCallApproved.create({
      data,
    });
  }
}
