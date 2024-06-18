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

  findPending(page: number = 0, take: number = 10): Promise<ContractCallApproved[] | null> {
    // Last updated more than one minute ago, if retrying
    const lastUpdatedAt = new Date(new Date().getTime() - 60_000);

    return this.prisma.contractCallApproved.findMany({
      where: {
        status: ContractCallApprovedStatus.PENDING,
        OR: [
          { retry: 0 },
          {
            updatedAt: {
              lt: lastUpdatedAt,
            },
          },
        ],
      },
      orderBy: [
        { retry: 'asc' }, // new entries have priority over older ones
        { createdAt: 'asc' },
      ],
      skip: page * take,
      take,
    });
  }

  findByCommandId(commandId: string): Promise<ContractCallApproved | null> {
    return this.prisma.contractCallApproved.findUnique({
      where: {
        commandId: commandId,
      },
    });
  }

  async updateManyPartial(entries: ContractCallApproved[]) {
    await this.prisma.$transaction(
      entries.map((data) => {
        return this.prisma.contractCallApproved.update({
          where: {
            commandId: data.commandId,
          },
          data: {
            status: data.status,
            retry: data.retry,
            executeTxHash: data.executeTxHash,
            successTimes: data.successTimes,
          },
        });
      }),
    );
  }

  async updateStatusAndSuccessTimes(data: ContractCallApproved) {
    await this.prisma.contractCallApproved.update({
      where: {
        commandId: data.commandId,
      },
      data: {
        status: data.status,
        successTimes: data.successTimes,
      },
    });
  }
}
