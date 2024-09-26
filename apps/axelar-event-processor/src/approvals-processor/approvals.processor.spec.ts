import { CacheInfo, GasServiceContract, TransactionsHelper } from '@mvx-monorepo/common';
import { createMock, DeepMocked } from '@golevelup/ts-jest';
import { Test } from '@nestjs/testing';
import { AxelarGmpApi } from '@mvx-monorepo/common/api/axelar.gmp.api';
import { GatewayContract } from '@mvx-monorepo/common/contracts/gateway.contract';
import { ApprovalsProcessorService } from './approvals.processor.service';
import { RedisCacheService } from '@multiversx/sdk-nestjs-cache';
import { UserSigner } from '@multiversx/sdk-wallet/out';
import { ProviderKeys } from '@mvx-monorepo/common/utils/provider.enum';
import { UserAddress } from '@multiversx/sdk-wallet/out/userAddress';
import { Transaction } from '@multiversx/sdk-core/out';
import { BinaryUtils } from '@multiversx/sdk-nestjs-common';
import { MessageApprovedRepository } from '@mvx-monorepo/common/database/repository/message-approved.repository';
import { Components, VerifyTask } from '@mvx-monorepo/common/api/entities/axelar.gmp.api';
import { MessageApprovedStatus } from '@prisma/client';
import { AccountOnNetwork, ApiNetworkProvider } from '@multiversx/sdk-network-providers/out';
import BigNumber from 'bignumber.js';
import GatewayTransactionTask = Components.Schemas.GatewayTransactionTask;
import TaskItem = Components.Schemas.TaskItem;
import RefundTask = Components.Schemas.RefundTask;
import ExecuteTask = Components.Schemas.ExecuteTask;

const mockExternalData = BinaryUtils.base64Encode('approveMessages@61726731@61726732');
const mockVerifyData = BinaryUtils.base64Encode('rotateSigners@1234@4321');

describe('ApprovalsProcessorService', () => {
  let axelarGmpApi: DeepMocked<AxelarGmpApi>;
  let redisCacheService: DeepMocked<RedisCacheService>;
  let walletSigner: DeepMocked<UserSigner>;
  let transactionsHelper: DeepMocked<TransactionsHelper>;
  let gatewayContract: DeepMocked<GatewayContract>;
  let messageApprovedRepository: DeepMocked<MessageApprovedRepository>;
  let gasServiceContract: DeepMocked<GasServiceContract>;
  let api: DeepMocked<ApiNetworkProvider>;

  let service: ApprovalsProcessorService;

  beforeEach(async () => {
    axelarGmpApi = createMock();
    redisCacheService = createMock();
    walletSigner = createMock();
    transactionsHelper = createMock();
    gatewayContract = createMock();
    messageApprovedRepository = createMock();
    gasServiceContract = createMock();
    api = createMock();

    const moduleRef = await Test.createTestingModule({
      providers: [ApprovalsProcessorService],
    })
      .useMocker((token) => {
        if (token === AxelarGmpApi) {
          return axelarGmpApi;
        }

        if (token === RedisCacheService) {
          return redisCacheService;
        }

        if (token === ProviderKeys.WALLET_SIGNER) {
          return walletSigner;
        }

        if (token === TransactionsHelper) {
          return transactionsHelper;
        }

        if (token === GatewayContract) {
          return gatewayContract;
        }

        if (token === MessageApprovedRepository) {
          return messageApprovedRepository;
        }

        if (token === GasServiceContract) {
          return gasServiceContract;
        }

        if (token === ApiNetworkProvider) {
          return api;
        }

        return null;
      })
      .compile();

    redisCacheService.get.mockImplementation(() => {
      return Promise.resolve(undefined);
    });

    service = moduleRef.get(ApprovalsProcessorService);
  });

  describe('handleNewTasks', () => {
    it('Should handle get tasks error', async () => {
      axelarGmpApi.getTasks.mockRejectedValueOnce(new Error('Network error'));

      await service.handleNewTasksRaw();

      expect(axelarGmpApi.getTasks).toHaveBeenCalledTimes(1);
    });

    it('Should handle get tasks as long as there are tasks', async () => {
      // @ts-ignore
      axelarGmpApi.getTasks.mockImplementation((_, lastTaskUUID) => {
        let tasks: TaskItem[] = [];
        if (lastTaskUUID !== 'lastUUID1') {
          tasks = [
            {
              type: 'REFUND',
              task: {
                refundRecipientAddress: '',
                remainingGasBalance: {
                  amount: '0',
                },
                message: {
                  messageID: '',
                  payloadHash: '',
                  sourceChain: '',
                  sourceAddress: '',
                  destinationAddress: '',
                },
              } as RefundTask,
              id: 'lastUUID1',
              timestamp: '1234',
            },
          ];
        }

        return Promise.resolve({
          data: {
            tasks,
          },
        });
      });

      await service.handleNewTasksRaw();

      expect(axelarGmpApi.getTasks).toHaveBeenCalledTimes(2);
      expect(axelarGmpApi.getTasks).toHaveBeenCalledWith('multiversx', undefined);
      expect(redisCacheService.set).toHaveBeenCalledWith(
        CacheInfo.LastTaskUUID().key,
        'lastUUID1',
        CacheInfo.LastTaskUUID().ttl,
      );
    });

    it('Should handle gateway tx task', async () => {
      axelarGmpApi.getTasks.mockReturnValueOnce(
        // @ts-ignore
        Promise.resolve({
          data: {
            tasks: [
              {
                type: 'GATEWAY_TX',
                task: {
                  executeData: mockExternalData,
                } as GatewayTransactionTask,
                id: 'UUID',
                timestamp: '1234',
              },
            ],
          },
        }),
      );

      const userAddress = UserAddress.newFromBech32('erd1qqqqqqqqqqqqqpgqhe8t5jewej70zupmh44jurgn29psua5l2jps3ntjj3');
      walletSigner.getAddress.mockReturnValueOnce(userAddress);

      const transaction: DeepMocked<Transaction> = createMock();
      gatewayContract.buildTransactionExternalFunction.mockReturnValueOnce(transaction);

      transactionsHelper.getTransactionGas.mockReturnValueOnce(Promise.resolve(100_000_000));
      transactionsHelper.signAndSendTransaction.mockReturnValueOnce(Promise.resolve('txHash'));

      await service.handleNewTasksRaw();

      expect(redisCacheService.get).toHaveBeenCalledTimes(1);
      expect(axelarGmpApi.getTasks).toHaveBeenCalledTimes(2);
      expect(axelarGmpApi.getTasks).toHaveBeenCalledWith('multiversx', undefined);
      expect(axelarGmpApi.getTasks).toHaveBeenCalledWith('multiversx', 'UUID');

      expect(gatewayContract.buildTransactionExternalFunction).toHaveBeenCalledTimes(1);
      expect(gatewayContract.buildTransactionExternalFunction).toHaveBeenCalledWith(
        'approveMessages@61726731@61726732',
        userAddress,
        1,
      );
      expect(transactionsHelper.getTransactionGas).toHaveBeenCalledTimes(1);
      expect(transactionsHelper.getTransactionGas).toHaveBeenCalledWith(transaction, 0);
      expect(transaction.setGasLimit).toHaveBeenCalledTimes(1);
      expect(transaction.setGasLimit).toHaveBeenCalledWith(100_000_000);
      expect(transactionsHelper.signAndSendTransaction).toHaveBeenCalledTimes(1);
      expect(transactionsHelper.signAndSendTransaction).toHaveBeenCalledWith(transaction, walletSigner);

      expect(redisCacheService.set).toHaveBeenCalledTimes(2);
      expect(redisCacheService.set).toHaveBeenCalledWith(
        CacheInfo.PendingTransaction('txHash').key,
        {
          txHash: 'txHash',
          externalData: mockExternalData,
          retry: 1,
        },
        CacheInfo.PendingTransaction('txHash').ttl,
      );

      expect(redisCacheService.set).toHaveBeenCalledWith(
        CacheInfo.LastTaskUUID().key,
        'UUID',
        CacheInfo.LastTaskUUID().ttl,
      );
    });

    it('Should handle execute task', async () => {
      axelarGmpApi.getTasks.mockReturnValueOnce(
        // @ts-ignore
        Promise.resolve({
          data: {
            tasks: [
              {
                type: 'EXECUTE',
                task: {
                  payload: BinaryUtils.hexToBase64('0123'),
                  availableGasBalance: {
                    amount: '0',
                  },
                  message: {
                    messageID: 'messageId',
                    destinationAddress: 'destinationAddress',
                    sourceAddress: 'sourceAddress',
                    sourceChain: 'ethereum',
                    payloadHash: BinaryUtils.hexToBase64('0234'),
                  },
                } as ExecuteTask,
                id: 'UUID',
                timestamp: '1234',
              },
            ],
          },
        }),
      );

      await service.handleNewTasksRaw();

      expect(messageApprovedRepository.create).toHaveBeenCalledTimes(1);
      expect(messageApprovedRepository.create).toHaveBeenCalledWith({
        sourceChain: 'ethereum',
        messageId: 'messageId',
        status: MessageApprovedStatus.PENDING,
        sourceAddress: 'sourceAddress',
        contractAddress: 'destinationAddress',
        payloadHash: '0234',
        payload: Buffer.from('0123', 'hex'),
        retry: 0,
        taskItemId: 'UUID',
      });
      expect(redisCacheService.set).toHaveBeenCalledTimes(1);
    });

    it('Should handle execute task duplicate in database', async () => {
      axelarGmpApi.getTasks.mockReturnValueOnce(
        // @ts-ignore
        Promise.resolve({
          data: {
            tasks: [
              {
                type: 'EXECUTE',
                task: {
                  payload: '0123',
                  availableGasBalance: {
                    amount: '0',
                  },
                  message: {
                    messageID: 'messageId',
                    destinationAddress: 'destinationAddress',
                    sourceAddress: 'sourceAddress',
                    sourceChain: 'ethereum',
                    payloadHash: '0234',
                  },
                } as ExecuteTask,
                id: 'UUID',
                timestamp: '1234',
              },
            ],
          },
        }),
      );

      messageApprovedRepository.create.mockReturnValueOnce(Promise.resolve(null));

      await service.handleNewTasksRaw();

      expect(messageApprovedRepository.create).toHaveBeenCalledTimes(1);
      expect(redisCacheService.set).toHaveBeenCalledTimes(1);
    });

    it('Should not save last task uuid if error', async () => {
      axelarGmpApi.getTasks.mockReturnValueOnce(
        // @ts-ignore
        Promise.resolve({
          data: {
            tasks: [
              {
                type: 'GATEWAY_TX',
                task: {
                  executeData: mockExternalData,
                } as GatewayTransactionTask,
                id: 'UUID',
                timestamp: '1234',
              },
            ],
          },
        }),
      );

      const userAddress = UserAddress.newFromBech32('erd1qqqqqqqqqqqqqpgqhe8t5jewej70zupmh44jurgn29psua5l2jps3ntjj3');
      walletSigner.getAddress.mockReturnValueOnce(userAddress);
      const transaction: DeepMocked<Transaction> = createMock();
      gatewayContract.buildTransactionExternalFunction.mockReturnValueOnce(transaction);
      transactionsHelper.getTransactionGas.mockRejectedValueOnce(new Error('Network error'));

      await service.handleNewTasksRaw();

      expect(transactionsHelper.getTransactionGas).toHaveBeenCalledTimes(1);
      expect(transactionsHelper.getTransactionGas).toHaveBeenCalledWith(transaction, 0);

      expect(redisCacheService.set).not.toHaveBeenCalled();

      // Mock lastUUID
      redisCacheService.get.mockImplementation(() => {
        return Promise.resolve('lastUUID1');
      });

      // Will start processing tasks from lastUUID1
      await service.handleNewTasksRaw();

      expect(redisCacheService.get).toHaveBeenCalledTimes(2);
      expect(axelarGmpApi.getTasks).toHaveBeenCalledTimes(2);
      expect(axelarGmpApi.getTasks).toHaveBeenCalledWith('multiversx', 'lastUUID1');
    });

    it('Should handle verify task', async () => {
      axelarGmpApi.getTasks.mockReturnValueOnce(
        // @ts-ignore
        Promise.resolve({
          data: {
            tasks: [
              {
                type: 'VERIFY',
                task: {
                  message: {
                    messageID: '',
                    payloadHash: '',
                    sourceChain: '',
                    sourceAddress: '',
                    destinationAddress: '',
                  },
                  payload: mockVerifyData,
                } as VerifyTask,
                id: 'UUID',
                timestamp: '1234',
              },
            ],
          },
        }),
      );

      const userAddress = UserAddress.newFromBech32('erd1qqqqqqqqqqqqqpgqhe8t5jewej70zupmh44jurgn29psua5l2jps3ntjj3');
      walletSigner.getAddress.mockReturnValueOnce(userAddress);

      const transaction: DeepMocked<Transaction> = createMock();
      gatewayContract.buildTransactionExternalFunction.mockReturnValueOnce(transaction);

      transactionsHelper.getTransactionGas.mockReturnValueOnce(Promise.resolve(100_000_000));
      transactionsHelper.signAndSendTransaction.mockReturnValueOnce(Promise.resolve('txHash'));

      await service.handleNewTasksRaw();

      expect(redisCacheService.get).toHaveBeenCalledTimes(1);
      expect(axelarGmpApi.getTasks).toHaveBeenCalledTimes(2);
      expect(axelarGmpApi.getTasks).toHaveBeenCalledWith('multiversx', undefined);
      expect(axelarGmpApi.getTasks).toHaveBeenCalledWith('multiversx', 'UUID');

      expect(gatewayContract.buildTransactionExternalFunction).toHaveBeenCalledTimes(1);
      expect(gatewayContract.buildTransactionExternalFunction).toHaveBeenCalledWith(
        'rotateSigners@1234@4321',
        userAddress,
        1,
      );
      expect(transactionsHelper.getTransactionGas).toHaveBeenCalledTimes(1);
      expect(transactionsHelper.getTransactionGas).toHaveBeenCalledWith(transaction, 0);
      expect(transaction.setGasLimit).toHaveBeenCalledTimes(1);
      expect(transaction.setGasLimit).toHaveBeenCalledWith(100_000_000);
      expect(transactionsHelper.signAndSendTransaction).toHaveBeenCalledTimes(1);
      expect(transactionsHelper.signAndSendTransaction).toHaveBeenCalledWith(transaction, walletSigner);

      expect(redisCacheService.set).toHaveBeenCalledTimes(2);
      expect(redisCacheService.set).toHaveBeenCalledWith(
        CacheInfo.PendingTransaction('txHash').key,
        {
          txHash: 'txHash',
          externalData: mockVerifyData,
          retry: 1,
        },
        CacheInfo.PendingTransaction('txHash').ttl,
      );

      expect(redisCacheService.set).toHaveBeenCalledWith(
        CacheInfo.LastTaskUUID().key,
        'UUID',
        CacheInfo.LastTaskUUID().ttl,
      );
    });
  });

  describe('handlePendingTransactions', () => {
    it('Should handle undefined', async () => {
      const key = CacheInfo.PendingTransaction('txHashUndefined').key;

      redisCacheService.scan.mockReturnValueOnce(Promise.resolve([key]));
      redisCacheService.get.mockReturnValueOnce(Promise.resolve(undefined));

      await service.handlePendingTransactionsRaw();

      expect(redisCacheService.scan).toHaveBeenCalledTimes(1);
      expect(redisCacheService.get).toHaveBeenCalledTimes(1);
      expect(redisCacheService.get).toHaveBeenCalledWith(key);
      expect(redisCacheService.delete).toHaveBeenCalledTimes(1);
      expect(redisCacheService.delete).toHaveBeenCalledWith(key);
      expect(transactionsHelper.awaitSuccess).not.toHaveBeenCalled();
    });

    it('Should handle success', async () => {
      const key = CacheInfo.PendingTransaction('txHashComplete').key;

      redisCacheService.scan.mockReturnValueOnce(Promise.resolve([key]));
      redisCacheService.get.mockReturnValueOnce(
        Promise.resolve({
          txHash: 'txHashComplete',
          executeData: mockExternalData,
          retry: 1,
        }),
      );
      transactionsHelper.awaitSuccess.mockReturnValueOnce(Promise.resolve(true));

      await service.handlePendingTransactionsRaw();

      expect(redisCacheService.scan).toHaveBeenCalledTimes(1);
      expect(redisCacheService.get).toHaveBeenCalledTimes(1);
      expect(redisCacheService.get).toHaveBeenCalledWith(key);
      expect(redisCacheService.delete).toHaveBeenCalledTimes(1);
      expect(redisCacheService.delete).toHaveBeenCalledWith(key);
      expect(transactionsHelper.awaitSuccess).toHaveBeenCalledTimes(1);
      expect(transactionsHelper.awaitSuccess).toHaveBeenCalledWith('txHashComplete');
      expect(transactionsHelper.getTransactionGas).not.toHaveBeenCalled();
    });

    it('Should handle retry', async () => {
      const key = CacheInfo.PendingTransaction('txHashComplete').key;
      const externalData = mockExternalData;

      redisCacheService.scan.mockReturnValueOnce(Promise.resolve([key]));
      redisCacheService.get.mockReturnValueOnce(
        Promise.resolve({
          txHash: 'txHashComplete',
          externalData,
          retry: 1,
        }),
      );
      transactionsHelper.awaitSuccess.mockReturnValueOnce(Promise.resolve(false));

      const userAddress = UserAddress.fromBech32('erd1qqqqqqqqqqqqqpgqhe8t5jewej70zupmh44jurgn29psua5l2jps3ntjj3');
      walletSigner.getAddress.mockReturnValueOnce(userAddress);

      const transaction: DeepMocked<Transaction> = createMock();
      gatewayContract.buildTransactionExternalFunction.mockReturnValueOnce(transaction);

      transactionsHelper.getTransactionGas.mockReturnValueOnce(Promise.resolve(100_000_000));
      transactionsHelper.signAndSendTransaction.mockReturnValueOnce(Promise.resolve('txHash'));

      await service.handlePendingTransactionsRaw();

      expect(transactionsHelper.awaitSuccess).toHaveBeenCalledTimes(1);
      expect(transactionsHelper.awaitSuccess).toHaveBeenCalledWith('txHashComplete');

      expect(gatewayContract.buildTransactionExternalFunction).toHaveBeenCalledTimes(1);
      expect(gatewayContract.buildTransactionExternalFunction).toHaveBeenCalledWith(
        BinaryUtils.base64Decode(externalData),
        userAddress,
        1,
      );
      expect(transactionsHelper.getTransactionGas).toHaveBeenCalledTimes(1);
      expect(transactionsHelper.getTransactionGas).toHaveBeenCalledWith(transaction, 1);
      expect(transaction.setGasLimit).toHaveBeenCalledTimes(1);
      expect(transaction.setGasLimit).toHaveBeenCalledWith(100_000_000);
      expect(transactionsHelper.signAndSendTransaction).toHaveBeenCalledTimes(1);
      expect(transactionsHelper.signAndSendTransaction).toHaveBeenCalledWith(transaction, walletSigner);

      expect(redisCacheService.set).toHaveBeenCalledTimes(1);
      expect(redisCacheService.set).toHaveBeenCalledWith(
        CacheInfo.PendingTransaction('txHash').key,
        {
          txHash: 'txHash',
          externalData,
          retry: 2,
        },
        CacheInfo.PendingTransaction('txHash').ttl,
      );
    });

    it('Should not handle final retry', async () => {
      const key = CacheInfo.PendingTransaction('txHashComplete').key;
      const executeData = Uint8Array.of(1, 2, 3, 4);

      redisCacheService.scan.mockReturnValueOnce(Promise.resolve([key]));
      redisCacheService.get.mockReturnValueOnce(
        Promise.resolve({
          txHash: 'txHashComplete',
          executeData,
          retry: 3,
        }),
      );
      transactionsHelper.awaitSuccess.mockReturnValueOnce(Promise.resolve(false));

      await service.handlePendingTransactionsRaw();

      expect(transactionsHelper.awaitSuccess).toHaveBeenCalledTimes(1);
      expect(transactionsHelper.awaitSuccess).toHaveBeenCalledWith('txHashComplete');
      expect(transactionsHelper.getTransactionGas).not.toHaveBeenCalled();
    });

    it('Should handle retry error', async () => {
      const key = CacheInfo.PendingTransaction('txHashComplete').key;
      const externalData = mockExternalData;

      redisCacheService.scan.mockReturnValueOnce(Promise.resolve([key]));
      redisCacheService.get.mockReturnValueOnce(
        Promise.resolve({
          txHash: 'txHashComplete',
          externalData,
          retry: 1,
        }),
      );
      transactionsHelper.awaitSuccess.mockReturnValueOnce(Promise.resolve(false));

      const userAddress = UserAddress.fromBech32('erd1qqqqqqqqqqqqqpgqhe8t5jewej70zupmh44jurgn29psua5l2jps3ntjj3');
      walletSigner.getAddress.mockReturnValueOnce(userAddress);

      const transaction: DeepMocked<Transaction> = createMock();
      gatewayContract.buildTransactionExternalFunction.mockReturnValueOnce(transaction);

      transactionsHelper.getTransactionGas.mockRejectedValueOnce(new Error('Network error'));

      await service.handlePendingTransactionsRaw();

      expect(transactionsHelper.awaitSuccess).toHaveBeenCalledTimes(1);
      expect(transactionsHelper.awaitSuccess).toHaveBeenCalledWith('txHashComplete');

      expect(transactionsHelper.getTransactionGas).toHaveBeenCalledTimes(1);
      expect(transactionsHelper.getTransactionGas).toHaveBeenCalledWith(transaction, 1);
      expect(redisCacheService.set).toHaveBeenCalledTimes(1);
      expect(redisCacheService.set).toHaveBeenCalledWith(
        CacheInfo.PendingTransaction('txHashComplete').key,
        {
          txHash: 'txHashComplete',
          externalData,
          retry: 1,
        },
        CacheInfo.PendingTransaction('txHashComplete').ttl,
      );
    });
  });

  describe('processRefundTask', () => {
    function assertRefundSuccess(userAddress: UserAddress, transaction: Transaction, token: string) {
      expect(redisCacheService.set).toHaveBeenCalledTimes(1);
      expect(axelarGmpApi.getTasks).toHaveBeenCalledTimes(2);
      expect(axelarGmpApi.getTasks).toHaveBeenCalledWith('multiversx', undefined);
      expect(axelarGmpApi.getTasks).toHaveBeenCalledWith('multiversx', 'UUID');

      expect(gasServiceContract.refund).toHaveBeenCalledTimes(1);
      expect(gasServiceContract.refund).toHaveBeenCalledWith(
        userAddress,
        'messageTxHash',
        '1',
        'recipientAddress',
        token,
        '1000',
      );
      expect(transactionsHelper.signAndSendTransactionAndGetNonce).toHaveBeenCalledTimes(1);
      expect(transactionsHelper.signAndSendTransactionAndGetNonce).toHaveBeenCalledWith(transaction, walletSigner);
    }

    it('Should handle process refund task EGLD success', async () => {
      axelarGmpApi.getTasks.mockReturnValueOnce(
        // @ts-ignore
        Promise.resolve({
          data: {
            tasks: [
              {
                type: 'REFUND',
                task: {
                  refundRecipientAddress: 'recipientAddress',
                  remainingGasBalance: {
                    amount: '1000',
                    tokenID: '',
                  },
                  message: {
                    messageID: '0xmessageTxHash-1',
                    payloadHash: '',
                    sourceChain: '',
                    sourceAddress: '',
                    destinationAddress: '',
                  },
                } as RefundTask,
                id: 'UUID',
                timestamp: '1234',
              },
            ],
          },
        }),
      );

      api.getAccount.mockReturnValueOnce(Promise.resolve(new AccountOnNetwork({ balance: new BigNumber('1000') })));

      const userAddress = UserAddress.newFromBech32('erd1qqqqqqqqqqqqqpgqhe8t5jewej70zupmh44jurgn29psua5l2jps3ntjj3');
      walletSigner.getAddress.mockReturnValueOnce(userAddress);

      const transaction: DeepMocked<Transaction> = createMock();
      gasServiceContract.refund.mockReturnValueOnce(transaction);

      transactionsHelper.signAndSendTransactionAndGetNonce.mockReturnValueOnce(Promise.resolve('txHash'));

      await service.handleNewTasksRaw();

      expect(api.getAccount).toHaveBeenCalledTimes(1);

      assertRefundSuccess(userAddress, transaction, 'EGLD');
    });

    it('Should handle process refund task ESDT success', async () => {
      axelarGmpApi.getTasks.mockReturnValueOnce(
        // @ts-ignore
        Promise.resolve({
          data: {
            tasks: [
              {
                type: 'REFUND',
                task: {
                  refundRecipientAddress: 'recipientAddress',
                  remainingGasBalance: {
                    amount: '1000',
                    tokenID: 'WEGLD-123456',
                  },
                  message: {
                    messageID: '0xmessageTxHash-1',
                    payloadHash: '',
                    sourceChain: '',
                    sourceAddress: '',
                    destinationAddress: '',
                  },
                } as RefundTask,
                id: 'UUID',
                timestamp: '1234',
              },
            ],
          },
        }),
      );

      api.getFungibleTokenOfAccount.mockReturnValueOnce(
        Promise.resolve({
          identifier: 'WEGLD-123456',
          balance: new BigNumber('2000'),
          rawResponse: {},
        }),
      );

      const userAddress = UserAddress.newFromBech32('erd1qqqqqqqqqqqqqpgqhe8t5jewej70zupmh44jurgn29psua5l2jps3ntjj3');
      walletSigner.getAddress.mockReturnValueOnce(userAddress);

      const transaction: DeepMocked<Transaction> = createMock();
      gasServiceContract.refund.mockReturnValueOnce(transaction);

      transactionsHelper.signAndSendTransactionAndGetNonce.mockReturnValueOnce(Promise.resolve('txHash'));

      await service.handleNewTasksRaw();

      expect(api.getFungibleTokenOfAccount).toHaveBeenCalledTimes(1);

      assertRefundSuccess(userAddress, transaction, 'WEGLD-123456');
    });

    it('Should handle process refund balance too low', async () => {
      axelarGmpApi.getTasks.mockReturnValueOnce(
        // @ts-ignore
        Promise.resolve({
          data: {
            tasks: [
              {
                type: 'REFUND',
                task: {
                  refundRecipientAddress: 'recipientAddress',
                  remainingGasBalance: {
                    amount: '1000',
                    tokenID: '',
                  },
                  message: {
                    messageID: '0xmessageTxHash-1',
                    payloadHash: '',
                    sourceChain: '',
                    sourceAddress: '',
                    destinationAddress: '',
                  },
                } as RefundTask,
                id: 'UUID',
                timestamp: '1234',
              },
            ],
          },
        }),
      );

      api.getAccount.mockReturnValueOnce(Promise.resolve(new AccountOnNetwork({ balance: new BigNumber('999') })));

      const userAddress = UserAddress.newFromBech32('erd1qqqqqqqqqqqqqpgqhe8t5jewej70zupmh44jurgn29psua5l2jps3ntjj3');
      walletSigner.getAddress.mockReturnValueOnce(userAddress);

      const transaction: DeepMocked<Transaction> = createMock();
      gasServiceContract.refund.mockReturnValueOnce(transaction);

      transactionsHelper.signAndSendTransactionAndGetNonce.mockReturnValueOnce(Promise.resolve('txHash'));

      await service.handleNewTasksRaw();

      expect(api.getAccount).toHaveBeenCalledTimes(1);

      expect(redisCacheService.set).toHaveBeenCalledTimes(1);
      expect(axelarGmpApi.getTasks).toHaveBeenCalledTimes(2);

      expect(gasServiceContract.refund).not.toHaveBeenCalled();
      expect(transactionsHelper.signAndSendTransactionAndGetNonce).not.toHaveBeenCalled();
    });

    it('Should handle process refund task ESDT exception', async () => {
      axelarGmpApi.getTasks.mockReturnValueOnce(
        // @ts-ignore
        Promise.resolve({
          data: {
            tasks: [
              {
                type: 'REFUND',
                task: {
                  refundRecipientAddress: 'recipientAddress',
                  remainingGasBalance: {
                    amount: '1000',
                    tokenID: 'WEGLD-123456',
                  },
                  message: {
                    messageID: '0xmessageTxHash-1',
                    payloadHash: '',
                    sourceChain: '',
                    sourceAddress: '',
                    destinationAddress: '',
                  },
                } as RefundTask,
                id: 'UUID',
                timestamp: '1234',
              },
            ],
          },
        }),
      );

      api.getFungibleTokenOfAccount.mockRejectedValue(new Error('No wegld token for address'));

      const userAddress = UserAddress.newFromBech32('erd1qqqqqqqqqqqqqpgqhe8t5jewej70zupmh44jurgn29psua5l2jps3ntjj3');
      walletSigner.getAddress.mockReturnValueOnce(userAddress);

      const transaction: DeepMocked<Transaction> = createMock();
      gasServiceContract.refund.mockReturnValueOnce(transaction);

      transactionsHelper.signAndSendTransactionAndGetNonce.mockReturnValueOnce(Promise.resolve('txHash'));

      await service.handleNewTasksRaw();

      expect(api.getFungibleTokenOfAccount).toHaveBeenCalledTimes(1);

      expect(redisCacheService.set).toHaveBeenCalledTimes(1);
      expect(axelarGmpApi.getTasks).toHaveBeenCalledTimes(2);

      expect(gasServiceContract.refund).not.toHaveBeenCalled();
      expect(transactionsHelper.signAndSendTransactionAndGetNonce).not.toHaveBeenCalled();
    });
  });
});
