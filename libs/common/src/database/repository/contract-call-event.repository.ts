import { Injectable } from '@nestjs/common';
import { PrismaService } from '@mvx-monorepo/common/database/prisma.service';
import { ContractCallEvent, ContractCallEventStatus, Prisma } from '@prisma/client';
import { ContractCallEventWithGasPaid } from '@mvx-monorepo/common/database/entities/contract-call-event';

@Injectable()
export class ContractCallEventRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(data: Prisma.ContractCallEventCreateInput): Promise<ContractCallEvent | null> {
    try {
      return await this.prisma.contractCallEvent.create({
        data,
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError) {
        // Unique constraint fails
        if (e.code === 'P2002') {
          return null;
        }
      }

      throw e;
    }
  }

  findWithoutGasPaid(gasPaid: Prisma.GasPaidCreateInput): Promise<ContractCallEvent | null> {
    return this.prisma.contractCallEvent.findFirst({
      where: {
        status: ContractCallEventStatus.PENDING,
        sourceAddress: gasPaid.sourceAddress,
        destinationAddress: gasPaid.destinationAddress,
        destinationChain: gasPaid.destinationChain,
        payloadHash: gasPaid.payloadHash,
        gasPaidEntries: {
          none: {},
        },
      },
    });
  }

  findOnePending(txHash: string, eventIndex: number): Promise<ContractCallEventWithGasPaid | null> {
    return this.prisma.contractCallEvent.findFirst({
      where: {
        txHash,
        eventIndex,
        status: ContractCallEventStatus.PENDING,
      },
      include: {
        gasPaidEntries: true,
      },
    });
  }

  findPending(page: number = 0, take: number = 10): Promise<ContractCallEvent[] | null> {
    // Last updated more than two minute ago, if retrying
    const lastUpdatedAt = new Date(new Date().getTime() - 120_000);

    return this.prisma.contractCallEvent.findMany({
      where: {
        status: ContractCallEventStatus.PENDING,

        updatedAt: {
          lt: lastUpdatedAt,
        },
      },
      orderBy: [{ createdAt: 'asc' }],
      skip: page * take,
      take,
    });
  }

  async updateStatus(data: ContractCallEvent) {
    await this.prisma.contractCallEvent.update({
      where: {
        id: data.id,
      },
      data: {
        status: data.status,
      },
    });
  }
}
