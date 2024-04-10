import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { AccountOnNetwork, ProxyNetworkProvider, TransactionStatus } from '@multiversx/sdk-network-providers/out';
import {
  CallContractApprovedProcessorModule,
  CallContractApprovedProcessorService,
} from '../src/call-contract-approved-processor';
import { ContractCallApprovedRepository } from '@mvx-monorepo/common/database/repository/contract-call-approved.repository';
import { PrismaService } from '@mvx-monorepo/common/database/prisma.service';
import { CacheService } from '@multiversx/sdk-nestjs-cache';
import { CacheInfo } from '@mvx-monorepo/common';
import { ContractCallApproved, ContractCallApprovedStatus } from '@prisma/client';
import { createMock, DeepMocked } from '@golevelup/ts-jest';
import { Transaction, TransactionWatcher } from '@multiversx/sdk-core/out';
import { BinaryUtils } from '@multiversx/sdk-nestjs-common';
import { AbiCoder } from 'ethers';

const WALLET_SIGNER_ADDRESS = 'erd1fsk0cnaag2m78gunfddsvg0y042rf0maxxgz6kvm32kxcl25m0yq8s38vt';

describe('CallContractApprovedProcessorService', () => {
  let cacheService: CacheService;
  let proxy: DeepMocked<ProxyNetworkProvider>;
  let transactionWatcher: DeepMocked<TransactionWatcher>;
  let prisma: PrismaService;
  let contractCallApprovedRepository: ContractCallApprovedRepository;

  let service: CallContractApprovedProcessorService;

  let app: INestApplication;

  const resetCache = async () => {
    await cacheService.deleteMany([CacheInfo.ChainId().key]);
  };

  beforeEach(async () => {
    proxy = createMock();
    transactionWatcher = createMock();

    const moduleRef = await Test.createTestingModule({
      imports: [CallContractApprovedProcessorModule],
    })
      .overrideProvider(ProxyNetworkProvider)
      .useValue(proxy)
      .overrideProvider(TransactionWatcher)
      .useValue(transactionWatcher)
      .compile();

    cacheService = await moduleRef.get(CacheService);
    prisma = await moduleRef.get(PrismaService);
    contractCallApprovedRepository = await moduleRef.get(ContractCallApprovedRepository);

    service = await moduleRef.get(CallContractApprovedProcessorService);

    // Mock general calls
    proxy.getAccount.mockReturnValueOnce(
      Promise.resolve(
        new AccountOnNetwork({
          nonce: 1,
        }),
      ),
    );
    proxy.doPostGeneric.mockImplementation((url: string, _: any): Promise<any> => {
      if (url === 'transaction/cost') {
        return Promise.resolve({
          data: {
            txGasUnits: 10_000_000,
          },
        });
      }

      return Promise.resolve(null);
    });

    // Reset database & cache
    await prisma.contractCallApproved.deleteMany();
    await resetCache();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    await resetCache();
    await prisma.$disconnect();

    await app.close();
  });

  const createContractCallApproved = async (
    extraData: Partial<ContractCallApproved> = {},
  ): Promise<ContractCallApproved> => {
    const result = await contractCallApprovedRepository.create({
      commandId: '0c38359b7a35c755573659d797afec315bb0e51374a056745abd9764715a15aa',
      txHash: 'txHashA',
      status: ContractCallApprovedStatus.PENDING,
      sourceAddress: 'sourceAddress',
      sourceChain: 'ethereum',
      contractAddress: 'erd1qqqqqqqqqqqqqpgqzqvm5ywqqf524efwrhr039tjs29w0qltkklsa05pk7',
      payloadHash: 'ebc84cbd75ba5516bf45e7024a9e12bc3c5c880f73e3a5beca7ebba52b2867a7',
      payload: Buffer.from('payload'),
      retry: 0,
      executeTxHash: null,
      updatedAt: new Date(),
      createdAt: new Date(),
      ...extraData,
    });

    if (!result) {
      throw new Error('Can not create database entries');
    }

    return result;
  };

  const assertArgs = (transaction: Transaction, entry: ContractCallApproved) => {
    const args = transaction.getData().toString().split('@');

    expect(args[0]).toBe('execute');
    expect(args[1]).toBe(entry.commandId);
    expect(args[2]).toBe(BinaryUtils.stringToHex(entry.sourceChain));
    expect(args[3]).toBe(BinaryUtils.stringToHex(entry.sourceAddress));
    expect(args[4]).toBe(entry.payload.toString('hex'));
  };

  it('Should send execute transaction two initial', async () => {
    const originalFirstEntry = await createContractCallApproved();
    const originalSecondEntry = await createContractCallApproved({
      commandId: '0c38359b7a35c755573659d797afec315bb0e51374a056745abd9764715a15bb',
      txHash: 'txHashB',
      sourceChain: 'polygon',
      sourceAddress: 'otherSourceAddress',
      payload: Buffer.from('otherPayload'),
    });

    await service.processPendingContractCallApproved();

    expect(proxy.getAccount).toHaveBeenCalledTimes(1);
    expect(proxy.doPostGeneric).toHaveBeenCalledTimes(2);
    expect(proxy.sendTransactions).toHaveBeenCalledTimes(1);

    // Assert transactions data is correct
    const transactions = proxy.sendTransactions.mock.lastCall?.[0] as Transaction[];
    expect(transactions).toHaveLength(2);

    expect(transactions[0].getGasLimit()).toBe(11_000_000); // 10% over 10_000_000
    expect(transactions[0].getNonce()).toBe(1);
    expect(transactions[0].getChainID()).toBe('test');
    expect(transactions[0].getSender().bech32()).toBe(WALLET_SIGNER_ADDRESS);
    assertArgs(transactions[0], originalFirstEntry);

    expect(transactions[1].getGasLimit()).toBe(11_000_000);
    expect(transactions[1].getNonce()).toBe(2);
    expect(transactions[1].getChainID()).toBe('test');
    expect(transactions[1].getSender().bech32()).toBe(WALLET_SIGNER_ADDRESS);
    assertArgs(transactions[1], originalSecondEntry);

    // No contract call approved pending
    expect(await contractCallApprovedRepository.findPending()).toEqual([]);

    // Expect entries in database updated
    const firstEntry = await contractCallApprovedRepository.findByCommandId(originalFirstEntry.commandId);
    expect(firstEntry).toEqual({
      ...originalFirstEntry,
      retry: 1,
      executeTxHash: 'dbb1d4ed062e8b71538567116b5360911d1fe43025f1cf1858a14666aa2c9fda',
      updatedAt: expect.any(Date),
    });

    const secondEntry = await contractCallApprovedRepository.findByCommandId(originalSecondEntry.commandId);
    expect(secondEntry).toEqual({
      ...originalSecondEntry,
      retry: 1,
      executeTxHash: 'cf1c10a09bf817e198bc18df08357c6ac7a666a3ea9f2b760f92762f1f591601',
      updatedAt: expect.any(Date),
    });
  });

  it('Should send execute transaction retry one processed one failed', async () => {
    // Entries will be processed
    const originalFirstEntry = await createContractCallApproved({
      retry: 1,
      updatedAt: new Date(new Date().getTime() - 60_500),
    });
    const originalSecondEntry = await createContractCallApproved({
      commandId: '0c38359b7a35c755573659d797afec315bb0e51374a056745abd9764715a15bb',
      txHash: 'txHashB',
      sourceChain: 'polygon',
      sourceAddress: 'otherSourceAddress',
      payload: Buffer.from('otherPayload'),
      retry: 3,
      updatedAt: new Date(new Date().getTime() - 60_500),
    });
    // Entry will not be processed (updated too early)
    const originalThirdEntry = await createContractCallApproved({
      commandId: '0c38359b7a35c755573659d797afec315bb0e51374a056745abd9764715a15cc',
      txHash: 'txHashC',
      retry: 1,
    });

    await service.processPendingContractCallApproved();

    expect(proxy.getAccount).toHaveBeenCalledTimes(1);
    expect(proxy.doPostGeneric).toHaveBeenCalledTimes(1);
    expect(proxy.sendTransactions).toHaveBeenCalledTimes(1);

    // Assert transactions data is correct
    const transactions = proxy.sendTransactions.mock.lastCall?.[0] as Transaction[];
    expect(transactions).toHaveLength(1);

    expect(transactions[0].getGasLimit()).toBe(13_000_000); // 10% + 20% over 10_000_000
    expect(transactions[0].getNonce()).toBe(1);
    expect(transactions[0].getChainID()).toBe('test');
    expect(transactions[0].getSender().bech32()).toBe(WALLET_SIGNER_ADDRESS);
    assertArgs(transactions[0], originalFirstEntry);

    // No contract call approved pending remained
    expect(await contractCallApprovedRepository.findPending()).toEqual([]);

    // Expect entries in database updated
    const firstEntry = await contractCallApprovedRepository.findByCommandId(originalFirstEntry.commandId);
    expect(firstEntry).toEqual({
      ...originalFirstEntry,
      retry: 2,
      executeTxHash: 'fc08669e4eabdf452e43adf5705777f8a527f4d6f84df9bf90ae74b499371061',
      updatedAt: expect.any(Date),
    });

    const secondEntry = await contractCallApprovedRepository.findByCommandId(originalSecondEntry.commandId);
    expect(secondEntry).toEqual({
      ...originalSecondEntry,
      status: ContractCallApprovedStatus.FAILED,
      updatedAt: expect.any(Date),
    });

    // Was not updated
    const thirdEntry = await contractCallApprovedRepository.findByCommandId(originalThirdEntry.commandId);
    expect(thirdEntry).toEqual({
      ...originalThirdEntry,
    });
  });

  describe('ITS execute', () => {
    const contractAddress = 'erd1qqqqqqqqqqqqqpgq97wezxw6l7lgg7k9rxvycrz66vn92ksh2tssxwf7ep';

    it('Should send execute transaction one deploy interchain token one other', async () => {
      const originalItsExecuteOther = await createContractCallApproved({
        contractAddress,
        payload: Buffer.from(AbiCoder.defaultAbiCoder().encode(['uint256'], [0]).substring(2), 'hex'),
      });
      const originalItsExecute = await createContractCallApproved({
        contractAddress,
        commandId: '0c38359b7a35c755573659d797afec315bb0e51374a056745abd9764715a15bb',
        txHash: 'txHashB',
        sourceChain: 'polygon',
        sourceAddress: 'otherSourceAddress',
        payload: Buffer.from(AbiCoder.defaultAbiCoder().encode(['uint256'], [1]).substring(2), 'hex'),
      });

      await service.processPendingContractCallApproved();

      expect(proxy.getAccount).toHaveBeenCalledTimes(1);
      expect(proxy.doPostGeneric).toHaveBeenCalledTimes(2);
      expect(proxy.sendTransactions).toHaveBeenCalledTimes(1);

      // Assert transactions data is correct
      const transactions = proxy.sendTransactions.mock.lastCall?.[0] as Transaction[];
      expect(transactions).toHaveLength(2);

      expect(transactions[0].getGasLimit()).toBe(11_000_000); // 10% over 10_000_000
      expect(transactions[0].getNonce()).toBe(1);
      expect(transactions[0].getChainID()).toBe('test');
      expect(transactions[0].getSender().bech32()).toBe(WALLET_SIGNER_ADDRESS);
      assertArgs(transactions[0], originalItsExecuteOther);
      expect(transactions[0].getValue()).toBe('0'); // assert sent with value 0

      expect(transactions[1].getGasLimit()).toBe(11_000_000);
      expect(transactions[1].getNonce()).toBe(2);
      expect(transactions[1].getChainID()).toBe('test');
      expect(transactions[1].getSender().bech32()).toBe(WALLET_SIGNER_ADDRESS);
      assertArgs(transactions[1], originalItsExecute);
      expect(transactions[1].getValue()).toBe('0'); // assert sent with value 0

      // No contract call approved pending
      expect(await contractCallApprovedRepository.findPending()).toEqual([]);

      // Expect entries in database updated
      const itsExecuteOther = await contractCallApprovedRepository.findByCommandId(originalItsExecuteOther.commandId);
      expect(itsExecuteOther).toEqual({
        ...originalItsExecuteOther,
        retry: 1,
        executeTxHash: '2795b8489921528a63a317ab6241e2b63f42fba3ac7f3821a524d771a55c2f1b',
        updatedAt: expect.any(Date),
        successTimes: null,
      });

      const itsExecute = await contractCallApprovedRepository.findByCommandId(originalItsExecute.commandId);
      expect(itsExecute).toEqual({
        ...originalItsExecute,
        retry: 1,
        executeTxHash: '9206c0fad5d91eef0802311b2baea2d6c91677da8a2fa6cc8ebc2d4a7c5892b4',
        updatedAt: expect.any(Date),
        successTimes: null,
      });
    });

    it.only('Should send execute transaction deploy interchain token 2 times', async () => {
      const originalItsExecute = await createContractCallApproved({
        contractAddress,
        commandId: '0c38359b7a35c755573659d797afec315bb0e51374a056745abd9764715a15bb',
        txHash: 'txHashB',
        sourceChain: 'polygon',
        sourceAddress: 'otherSourceAddress',
        payload: Buffer.from(AbiCoder.defaultAbiCoder().encode(['uint256'], [1]).substring(2), 'hex'),
      });

      proxy.sendTransactions.mockReturnValueOnce(Promise.resolve([
        'af0848face1fa76874752bbc9fab1928b33e08ff646471cab3d0fa91a6506a51',
      ]));

      await service.processPendingContractCallApproved();

      expect(proxy.getAccount).toHaveBeenCalledTimes(1);
      expect(proxy.doPostGeneric).toHaveBeenCalledTimes(1);
      expect(proxy.sendTransactions).toHaveBeenCalledTimes(1);

      // Assert transactions data is correct
      let transactions = proxy.sendTransactions.mock.lastCall?.[0] as Transaction[];
      expect(transactions).toHaveLength(1);

      expect(transactions[0].getGasLimit()).toBe(11_000_000);
      expect(transactions[0].getNonce()).toBe(1);
      expect(transactions[0].getChainID()).toBe('test');
      expect(transactions[0].getSender().bech32()).toBe(WALLET_SIGNER_ADDRESS);
      assertArgs(transactions[0], originalItsExecute);
      expect(transactions[0].getValue()).toBe('0'); // assert sent with no value 1st time

      // No contract call approved pending
      expect(await contractCallApprovedRepository.findPending()).toEqual([]);

      // @ts-ignore
      let itsExecute: ContractCallApproved = await contractCallApprovedRepository.findByCommandId(
        originalItsExecute.commandId,
      );
      expect(itsExecute).toEqual({
        ...originalItsExecute,
        retry: 1,
        executeTxHash: 'af0848face1fa76874752bbc9fab1928b33e08ff646471cab3d0fa91a6506a51',
        updatedAt: expect.any(Date),
        successTimes: null,
      });

      // Mark as last updated more than 1 minute ago
      itsExecute.updatedAt = new Date(new Date().getTime() - 60_500);
      await prisma.contractCallApproved.update({ where: { commandId: itsExecute.commandId }, data: itsExecute });

      // Mock 1st transaction executed successfully
      transactionWatcher.awaitCompleted.mockReturnValueOnce(
        // @ts-ignore
        Promise.resolve({
          ...transactions[0],
          status: new TransactionStatus('success'),
        }),
      );

      proxy.sendTransactions.mockReturnValueOnce(Promise.resolve([
        '36a71e24554303f6b734143ad90f939b57018f8c05f8abaa63e23950f899ce56',
      ]));

      // Process transaction 2nd time
      await service.processPendingContractCallApproved();

      transactions = proxy.sendTransactions.mock.lastCall?.[0] as Transaction[];
      expect(transactions).toHaveLength(1);
      expect(transactions[0].getValue()).toBe('50000000000000000'); // assert sent with value 2nd time

      // @ts-ignore
      itsExecute = await contractCallApprovedRepository.findByCommandId(originalItsExecute.commandId);
      expect(itsExecute).toEqual({
        ...originalItsExecute,
        retry: 2,
        executeTxHash: '36a71e24554303f6b734143ad90f939b57018f8c05f8abaa63e23950f899ce56',
        updatedAt: expect.any(Date),
        successTimes: 1,
      });

      // Mark as last updated more than 1 minute ago
      itsExecute.updatedAt = new Date(new Date().getTime() - 60_500);
      await prisma.contractCallApproved.update({ where: { commandId: itsExecute.commandId }, data: itsExecute });

      // Process transaction 3rd time will retry transaction not sent
      await service.processPendingContractCallApproved();

      transactions = proxy.sendTransactions.mock.lastCall?.[0] as Transaction[];
      expect(transactions).toHaveLength(1);
      expect(transactions[0].getValue()).toBe('50000000000000000'); // assert sent with value

      // @ts-ignore
      itsExecute = await contractCallApprovedRepository.findByCommandId(originalItsExecute.commandId);
      expect(itsExecute).toEqual({
        ...originalItsExecute,
        retry: 2,
        executeTxHash: '36a71e24554303f6b734143ad90f939b57018f8c05f8abaa63e23950f899ce56',
        updatedAt: expect.any(Date),
        successTimes: 1,
      });

      // Process transaction 3rd time will retry transaction sent
      proxy.sendTransactions.mockReturnValueOnce(Promise.resolve([
        'e072d88e869e51a261e4a48aea1abb6f62a1f69c8af6fc3740d26e57b5e0a2bb',
      ]));

      await service.processPendingContractCallApproved();

      transactions = proxy.sendTransactions.mock.lastCall?.[0] as Transaction[];
      expect(transactions).toHaveLength(1);
      expect(transactions[0].getValue()).toBe('50000000000000000'); // assert sent with value

      // @ts-ignore
      itsExecute = await contractCallApprovedRepository.findByCommandId(originalItsExecute.commandId);
      expect(itsExecute).toEqual({
        ...originalItsExecute,
        retry: 3,
        executeTxHash: 'e072d88e869e51a261e4a48aea1abb6f62a1f69c8af6fc3740d26e57b5e0a2bb',
        updatedAt: expect.any(Date),
        successTimes: 1,
      });
    });
  });
});
