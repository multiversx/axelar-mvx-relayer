import { Injectable } from '@nestjs/common';
import { PrismaService } from '@mvx-monorepo/common/database/prisma.service';
import { ContractCallApproved, ContractCallApprovedStatus, Prisma } from '@prisma/client';

@Injectable()
export class ContractCallApprovedRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(data: Prisma.ContractCallApprovedCreateInput): Promise<ContractCallApproved | null> {
    return this.prisma.contractCallApproved.create({
      data,
    });
  }

  findPendingNoRetries(page: number = 0, take: number = 10): Promise<ContractCallApproved[] | null> {
    return this.prisma.contractCallApproved.findMany({
      where: {
        status: ContractCallApprovedStatus.PENDING,
        retry: 0,
      },
      orderBy: {
        createdAt: 'desc',
      },
      skip: page * take,
      take,
    });
  }
}
