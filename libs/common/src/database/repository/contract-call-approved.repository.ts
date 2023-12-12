import { Injectable } from '@nestjs/common';
import { PrismaService } from '@mvx-monorepo/common/database/prisma.service';
import { ContractCallApproved, ContractCallApprovedStatus, Prisma } from '@prisma/client';

// Support a max of 3 retries (mainly because some Interchain Token Service endpoints need to be called 3 times)
export const MAX_NUMBER_OF_RETRIES: number = 3;

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
        executeTxHash: null,
      },
      orderBy: {
        createdAt: 'desc',
      },
      skip: page * take,
      take,
    });
  }

  findPendingForRetry(page: number = 0, take: number = 10): Promise<ContractCallApproved[] | null> {
    // Last updated more than one minute ago
    const lastUpdatedAt = new Date(new Date().getTime() - 60_000);

    return this.prisma.contractCallApproved.findMany({
      where: {
        status: ContractCallApprovedStatus.PENDING,
        retry: {
          lt: MAX_NUMBER_OF_RETRIES,
        },
        executeTxHash: {
          not: null,
        },
        updatedAt: {
          lt: lastUpdatedAt,
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
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

  async updateManyStatusRetryExecuteTxHash(entries: ContractCallApproved[]) {
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
          },
        });
      }),
    );
  }
}
