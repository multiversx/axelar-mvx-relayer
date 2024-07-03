import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { PrismaService } from '@mvx-monorepo/common/database/prisma.service';
import { ContractCallEventRepository } from '@mvx-monorepo/common/database/repository/contract-call-event.repository';
import {
  ContractCallEventProcessorModule,
  ContractCallEventProcessorService,
} from '../src/contract-call-event-processor';
import { ContractCallEvent, ContractCallEventStatus } from '@prisma/client';
import { createMock, DeepMocked } from '@golevelup/ts-jest';
import { GrpcModule, GrpcService } from '@mvx-monorepo/common';
import { TestGrpcModule } from './testGrpc.module';

describe('ContractCallEventProcessorService', () => {
  let prisma: PrismaService;
  let grpcService: DeepMocked<GrpcService>;
  let contractCallEventRepository: ContractCallEventRepository;

  let service: ContractCallEventProcessorService;

  let app: INestApplication;

  beforeEach(async () => {
    grpcService = createMock();

    const moduleRef = await Test.createTestingModule({
      imports: [ContractCallEventProcessorModule],
    })
      .overrideModule(GrpcModule)
      .useModule(TestGrpcModule)
      .overrideProvider(GrpcService)
      .useValue(grpcService)
      .compile();

    prisma = await moduleRef.get(PrismaService);
    contractCallEventRepository = await moduleRef.get(ContractCallEventRepository);

    service = await moduleRef.get(ContractCallEventProcessorService);

    // Reset database
    await prisma.contractCallEvent.deleteMany();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    await prisma.$disconnect();

    await app.close();
  });

  const createContractCallEvent = async (extraData: Partial<ContractCallEvent> = {}): Promise<ContractCallEvent> => {
    const result = await contractCallEventRepository.create({
      id: '0xMockTxHash:0',
      eventIndex: 0,
      txHash: 'txHashA',
      status: ContractCallEventStatus.PENDING,
      sourceChain: 'multiversx',
      sourceAddress: 'erd1qqqqqqqqqqqqqpgqzqvm5ywqqf524efwrhr039tjs29w0qltkklsa05pk7',
      destinationAddress: 'destinationAddress',
      destinationChain: 'ethereum',
      payloadHash: 'ebc84cbd75ba5516bf45e7024a9e12bc3c5c880f73e3a5beca7ebba52b2867a7',
      payload: Buffer.from('payload'),
      executeTxHash: null,
      updatedAt: new Date(new Date().getTime() - 120_500),
      createdAt: new Date(new Date().getTime() - 120_500),
      ...extraData,
    });

    if (!result) {
      throw new Error('Can not create database entries');
    }

    return result;
  };

  it('Should process pending contract call event', async () => {
    const originalEntry = await createContractCallEvent();

    try {
      await service.processPendingContractCallEvent();
    } catch (e) {
      // Locker.lock throws error for some reason, ignore
    }

    expect(await contractCallEventRepository.findPending()).toEqual([]);
    expect(grpcService.verify).toHaveBeenCalledTimes(1);

    const firstEntry = await prisma.contractCallEvent.findUnique({
      where: {
        id: originalEntry.id,
      },
    });
    expect(firstEntry).toEqual({
      ...originalEntry,
      status: ContractCallEventStatus.PENDING,
      retry: 1,
      updatedAt: expect.any(Date),
    });
  });

  it('Should process pending contract call event retry', async () => {
    const originalEntry = await createContractCallEvent({
      retry: 3,
    });

    try {
      await service.processPendingContractCallEvent();
    } catch (e) {
      // Locker.lock throws error for some reason, ignore
    }

    expect(await contractCallEventRepository.findPending()).toEqual([]);
    expect(grpcService.verify).not.toHaveBeenCalled();

    const firstEntry = await prisma.contractCallEvent.findUnique({
      where: {
        id: originalEntry.id,
      },
    });
    expect(firstEntry).toEqual({
      ...originalEntry,
      status: ContractCallEventStatus.FAILED,
      updatedAt: expect.any(Date),
    });
  });
});
