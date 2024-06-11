import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { AccountOnNetwork, ProxyNetworkProvider, TransactionStatus } from '@multiversx/sdk-network-providers/out';
import { MessageApprovedProcessorModule, MessageApprovedProcessorService } from '../src/message-approved-processor';
import { MessageApprovedRepository } from '@mvx-monorepo/common/database/repository/message-approved.repository';
import { PrismaService } from '@mvx-monorepo/common/database/prisma.service';
import { createMock, DeepMocked } from '@golevelup/ts-jest';
import { Transaction, TransactionWatcher } from '@multiversx/sdk-core/out';
import { BinaryUtils } from '@multiversx/sdk-nestjs-common';
import { AbiCoder } from 'ethers';
import { MessageApproved, MessageApprovedStatus } from '@prisma/client';

const WALLET_SIGNER_ADDRESS = 'erd1fsk0cnaag2m78gunfddsvg0y042rf0maxxgz6kvm32kxcl25m0yq8s38vt';

describe('CallContractApprovedProcessorService', () => {
  let proxy: DeepMocked<ProxyNetworkProvider>;
  let transactionWatcher: DeepMocked<TransactionWatcher>;
  let prisma: PrismaService;
  let messageApprovedRepository: MessageApprovedRepository;

  let service: MessageApprovedProcessorService;

  let app: INestApplication;

  beforeEach(async () => {
    proxy = createMock();
    transactionWatcher = createMock();

    const moduleRef = await Test.createTestingModule({
      imports: [MessageApprovedProcessorModule],
    })
      .overrideProvider(ProxyNetworkProvider)
      .useValue(proxy)
      .overrideProvider(TransactionWatcher)
      .useValue(transactionWatcher)
      .compile();

    prisma = await moduleRef.get(PrismaService);
    messageApprovedRepository = await moduleRef.get(MessageApprovedRepository);

    service = await moduleRef.get(MessageApprovedProcessorService);

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
    await prisma.messageApproved.deleteMany();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    await prisma.$disconnect();

    await app.close();
  });

  const createMessageApproved = async (extraData: Partial<MessageApproved> = {}): Promise<MessageApproved> => {
    const result = await messageApprovedRepository.create({
      commandId: '0c38359b7a35c755573659d797afec315bb0e51374a056745abd9764715a15aa',
      txHash: 'txHashA',
      status: MessageApprovedStatus.PENDING,
      sourceAddress: 'sourceAddress',
      messageId: 'messageId',
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

  const assertArgs = (transaction: Transaction, entry: MessageApproved) => {
    const args = transaction.getData().toString().split('@');

    expect(args[0]).toBe('execute');
    expect(args[1]).toBe(BinaryUtils.stringToHex(entry.sourceChain));
    expect(args[2]).toBe(BinaryUtils.stringToHex(entry.messageId));
    expect(args[3]).toBe(BinaryUtils.stringToHex(entry.sourceAddress));
    expect(args[4]).toBe(entry.payload.toString('hex'));
  };

  it('Should send execute transaction two initial', async () => {
    const originalFirstEntry = await createMessageApproved();
    const originalSecondEntry = await createMessageApproved({
      commandId: '0c38359b7a35c755573659d797afec315bb0e51374a056745abd9764715a15bb',
      messageId: 'messageId2',
      txHash: 'txHashB',
      sourceChain: 'polygon',
      sourceAddress: 'otherSourceAddress',
      payload: Buffer.from('otherPayload'),
    });

    proxy.sendTransactions.mockImplementation((transactions): Promise<string[]> => {
      return Promise.resolve(transactions.map((transaction: any) => transaction.getHash().toString() as string));
    });

    await service.processPendingMessageApproved();

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
    expect(await messageApprovedRepository.findPending()).toEqual([]);

    // Expect entries in database updated
    const firstEntry = await messageApprovedRepository.findByCommandId(originalFirstEntry.commandId);
    expect(firstEntry).toEqual({
      ...originalFirstEntry,
      retry: 1,
      executeTxHash: 'e2daca735e49dc56857886f74a82dcfec0c51fadaccf649fb59fd6525c0c6eb0',
      updatedAt: expect.any(Date),
    });

    const secondEntry = await messageApprovedRepository.findByCommandId(originalSecondEntry.commandId);
    expect(secondEntry).toEqual({
      ...originalSecondEntry,
      retry: 1,
      executeTxHash: 'b0de1af3ea2501bf0c6fdd71acad4c53eb2ca6c2921a1f8883bad371156997f6',
      updatedAt: expect.any(Date),
    });
  });

  it('Should send execute transaction retry one processed one failed', async () => {
    // Entries will be processed
    const originalFirstEntry = await createMessageApproved({
      retry: 1,
      updatedAt: new Date(new Date().getTime() - 60_500),
    });
    const originalSecondEntry = await createMessageApproved({
      commandId: '0c38359b7a35c755573659d797afec315bb0e51374a056745abd9764715a15bb',
      messageId: 'messageId2',
      txHash: 'txHashB',
      sourceChain: 'polygon',
      sourceAddress: 'otherSourceAddress',
      payload: Buffer.from('otherPayload'),
      retry: 3,
      updatedAt: new Date(new Date().getTime() - 60_500),
    });
    // Entry will not be processed (updated too early)
    const originalThirdEntry = await createMessageApproved({
      commandId: '0c38359b7a35c755573659d797afec315bb0e51374a056745abd9764715a15cc',
      messageId: 'messageId3',
      txHash: 'txHashC',
      retry: 1,
    });

    proxy.sendTransactions.mockImplementation((transactions): Promise<string[]> => {
      return Promise.resolve(transactions.map((transaction: any) => transaction.getHash().toString() as string));
    });

    await service.processPendingMessageApproved();

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
    expect(await messageApprovedRepository.findPending()).toEqual([]);

    // Expect entries in database updated
    const firstEntry = await messageApprovedRepository.findByCommandId(originalFirstEntry.commandId);
    expect(firstEntry).toEqual({
      ...originalFirstEntry,
      retry: 2,
      executeTxHash: '7807d1ac6b310b841c654b5a34be490ba04990d2c479c19335e55e031357d651',
      updatedAt: expect.any(Date),
    });

    const secondEntry = await messageApprovedRepository.findByCommandId(originalSecondEntry.commandId);
    expect(secondEntry).toEqual({
      ...originalSecondEntry,
      status: MessageApprovedStatus.FAILED,
      updatedAt: expect.any(Date),
    });

    // Was not updated
    const thirdEntry = await messageApprovedRepository.findByCommandId(originalThirdEntry.commandId);
    expect(thirdEntry).toEqual({
      ...originalThirdEntry,
    });
  });

  it('Should send execute transaction not successfully sent', async () => {
    const originalFirstEntry = await createMessageApproved();
    const originalSecondEntry = await createMessageApproved({
      commandId: '0c38359b7a35c755573659d797afec315bb0e51374a056745abd9764715a15bb',
      messageId: 'messageId2',
      txHash: 'txHashB',
      sourceChain: 'polygon',
      sourceAddress: 'otherSourceAddress',
      payload: Buffer.from('otherPayload'),
      retry: 2,
      updatedAt: new Date(new Date().getTime() - 60_500),
    });

    proxy.sendTransactions.mockImplementation((): Promise<string[]> => {
      return Promise.resolve([]);
    });

    await service.processPendingMessageApproved();

    expect(proxy.getAccount).toHaveBeenCalledTimes(1);
    expect(proxy.doPostGeneric).toHaveBeenCalledTimes(2);
    expect(proxy.sendTransactions).toHaveBeenCalledTimes(1);

    // Assert transactions data is correct
    const transactions = proxy.sendTransactions.mock.lastCall?.[0] as Transaction[];
    expect(transactions).toHaveLength(2);

    assertArgs(transactions[0], originalFirstEntry);
    assertArgs(transactions[1], originalSecondEntry);

    // 2 are still pending because of proxy error
    expect(await messageApprovedRepository.findPending()).toEqual([]);

    // Expect entries in database to NOT be updated
    const firstEntry = await messageApprovedRepository.findByCommandId(originalFirstEntry.commandId);
    expect(firstEntry).toEqual({
      ...originalFirstEntry,
      retry: 1, // retry is set to 1
      updatedAt: expect.any(Date),
    });

    const secondEntry = await messageApprovedRepository.findByCommandId(originalSecondEntry.commandId);
    expect(secondEntry).toEqual({
      ...originalSecondEntry,
      retry: 2, // retry stays the same
      updatedAt: expect.any(Date),
    });
  });

  function mockProxySendTransactionsSuccess() {
    proxy.sendTransactions.mockImplementation((transactions): Promise<string[]> => {
      return Promise.resolve(transactions.map((transaction: any) => transaction.getHash().toString() as string));
    });
  }

  describe('ITS execute', () => {
    const contractAddress = 'erd1qqqqqqqqqqqqqpgq97wezxw6l7lgg7k9rxvycrz66vn92ksh2tssxwf7ep';

    it('Should send execute transaction one deploy interchain token one other', async () => {
      const originalItsExecuteOther = await createMessageApproved({
        contractAddress,
        payload: Buffer.from(AbiCoder.defaultAbiCoder().encode(['uint256'], [0]).substring(2), 'hex'),
      });
      const originalItsExecute = await createMessageApproved({
        contractAddress,
        commandId: '0c38359b7a35c755573659d797afec315bb0e51374a056745abd9764715a15bb',
        txHash: 'txHashB',
        sourceChain: 'polygon',
        sourceAddress: 'otherSourceAddress',
        payload: Buffer.from(AbiCoder.defaultAbiCoder().encode(['uint256'], [1]).substring(2), 'hex'),
      });

      mockProxySendTransactionsSuccess();

      await service.processPendingMessageApproved();

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
      expect(await messageApprovedRepository.findPending()).toEqual([]);

      // Expect entries in database updated
      const itsExecuteOther = await messageApprovedRepository.findByCommandId(originalItsExecuteOther.commandId);
      expect(itsExecuteOther).toEqual({
        ...originalItsExecuteOther,
        retry: 1,
        executeTxHash: 'e55b33a1e697e68107c1581fe6b6d0885be0a69e00a4a191e3e217d64bea7133',
        updatedAt: expect.any(Date),
        successTimes: null,
      });

      const itsExecute = await messageApprovedRepository.findByCommandId(originalItsExecute.commandId);
      expect(itsExecute).toEqual({
        ...originalItsExecute,
        retry: 1,
        executeTxHash: '138878bdb853b0d1b2f19cb4d811a3aaa768a7081264a5eaef994f7c3c9a4fd2',
        updatedAt: expect.any(Date),
        successTimes: null,
      });
    });

    it('Should send execute transaction deploy interchain token 2 times', async () => {
      const originalItsExecute = await createMessageApproved({
        contractAddress,
        commandId: '0c38359b7a35c755573659d797afec315bb0e51374a056745abd9764715a15bb',
        txHash: 'txHashB',
        sourceChain: 'polygon',
        sourceAddress: 'otherSourceAddress',
        payload: Buffer.from(AbiCoder.defaultAbiCoder().encode(['uint256'], [1]).substring(2), 'hex'),
      });

      mockProxySendTransactionsSuccess();

      await service.processPendingMessageApproved();

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
      expect(await messageApprovedRepository.findPending()).toEqual([]);

      // @ts-ignore
      let itsExecute: MessageApproved = await messageApprovedRepository.findByCommandId(originalItsExecute.commandId);
      expect(itsExecute).toEqual({
        ...originalItsExecute,
        retry: 1,
        executeTxHash: 'a47a870b417e9e8de9eda053938ae7a63bc36034bed3a9708a8ee93f40674f14',
        updatedAt: expect.any(Date),
        successTimes: null,
      });

      // Mark as last updated more than 1 minute ago
      itsExecute.updatedAt = new Date(new Date().getTime() - 60_500);
      await prisma.messageApproved.update({ where: { commandId: itsExecute.commandId }, data: itsExecute });

      // Mock 1st transaction executed successfully
      transactionWatcher.awaitCompleted.mockReturnValueOnce(
        // @ts-ignore
        Promise.resolve({
          ...transactions[0],
          status: new TransactionStatus('success'),
        }),
      );

      // Process transaction 2nd time
      await service.processPendingMessageApproved();

      transactions = proxy.sendTransactions.mock.lastCall?.[0] as Transaction[];
      expect(transactions).toHaveLength(1);
      expect(transactions[0].getValue()).toBe('50000000000000000'); // assert sent with value 2nd time

      // @ts-ignore
      itsExecute = await messageApprovedRepository.findByCommandId(originalItsExecute.commandId);
      expect(itsExecute).toEqual({
        ...originalItsExecute,
        retry: 2,
        executeTxHash: '44e7f533bbb229bc5e401dae45a561cda2029e45d800e9ff797d3a87e698abb1',
        updatedAt: expect.any(Date),
        successTimes: 1,
      });

      // Mark as last updated more than 1 minute ago
      itsExecute.updatedAt = new Date(new Date().getTime() - 60_500);
      await prisma.messageApproved.update({ where: { commandId: itsExecute.commandId }, data: itsExecute });

      // Process transaction 3rd time will retry transaction not sent
      proxy.sendTransactions.mockReturnValueOnce(Promise.resolve([]));

      await service.processPendingMessageApproved();

      transactions = proxy.sendTransactions.mock.lastCall?.[0] as Transaction[];
      expect(transactions).toHaveLength(1);
      expect(transactions[0].getValue()).toBe('50000000000000000'); // assert sent with value

      // @ts-ignore
      itsExecute = await messageApprovedRepository.findByCommandId(originalItsExecute.commandId);
      expect(itsExecute).toEqual({
        ...originalItsExecute,
        retry: 2,
        executeTxHash: null,
        updatedAt: expect.any(Date),
        successTimes: 1,
      });

      // Mark as last updated more than 1 minute ago
      itsExecute.updatedAt = new Date(new Date().getTime() - 60_500);
      await prisma.messageApproved.update({ where: { commandId: itsExecute.commandId }, data: itsExecute });

      // Process transaction 3rd time will retry transaction sent
      mockProxySendTransactionsSuccess();

      await service.processPendingMessageApproved();

      transactions = proxy.sendTransactions.mock.lastCall?.[0] as Transaction[];
      expect(transactions).toHaveLength(1);
      expect(transactions[0].getValue()).toBe('50000000000000000'); // assert sent with value

      // @ts-ignore
      itsExecute = await messageApprovedRepository.findByCommandId(originalItsExecute.commandId);
      expect(itsExecute).toEqual({
        ...originalItsExecute,
        retry: 3,
        executeTxHash: 'bea373a3fc25339c2c409b0afb03664d87a8db85a3ec9fa77d9201e2409ca152',
        updatedAt: expect.any(Date),
        successTimes: 1,
      });
    });
  });
});
