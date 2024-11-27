import { Test, TestingModule } from '@nestjs/testing';
import { GasCheckerService } from './gas-checker.service';
import { createMock, DeepMocked } from '@golevelup/ts-jest';
import { CacheInfo, GasServiceContract, TransactionsHelper, WegldSwapContract } from '@mvx-monorepo/common';
import { UserSigner } from '@multiversx/sdk-wallet/out';
import { AccountOnNetwork, ApiNetworkProvider } from '@multiversx/sdk-network-providers/out';
import { ProviderKeys } from '@mvx-monorepo/common/utils/provider.enum';
import { Address, Transaction } from '@multiversx/sdk-core/out';
import { CacheService } from '@multiversx/sdk-nestjs-cache';
import { UserAddress } from '@multiversx/sdk-wallet/out/userAddress';
import BigNumber from 'bignumber.js';

describe('GasCheckerService', () => {
  const gasServiceAddress = Address.newFromBech32('erd1qqqqqqqqqqqqqpgqhe8t5jewej70zupmh44jurgn29psua5l2jps3ntjj3');
  const userSignerAddress = UserAddress.newFromBech32('erd1fsk0cnaag2m78gunfddsvg0y042rf0maxxgz6kvm32kxcl25m0yq8s38vt');

  let walletSigner: DeepMocked<UserSigner>;
  let transactionsHelper: DeepMocked<TransactionsHelper>;
  let api: DeepMocked<ApiNetworkProvider>;
  let wegldSwapContract: DeepMocked<WegldSwapContract>;
  let gasServiceContract: DeepMocked<GasServiceContract>;
  let cacheService: DeepMocked<CacheService>;

  let service: GasCheckerService;

  beforeEach(async () => {
    walletSigner = createMock();
    transactionsHelper = createMock();
    api = createMock();
    wegldSwapContract = createMock();
    gasServiceContract = createMock();
    cacheService = createMock();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GasCheckerService,
        {
          provide: CacheService,
          useValue: cacheService,
        },
      ],
    })
      .useMocker((token) => {
        if (token === ProviderKeys.WALLET_SIGNER) {
          return walletSigner;
        }

        if (token === TransactionsHelper) {
          return transactionsHelper;
        }

        if (token === ApiNetworkProvider) {
          return api;
        }

        if (token === WegldSwapContract) {
          return wegldSwapContract;
        }

        if (token === GasServiceContract) {
          return gasServiceContract;
        }

        return null;
      })
      .compile();

    gasServiceContract.getContractAddress.mockReturnValue(gasServiceAddress);
    cacheService.getOrSet.mockImplementation((key) => {
      if (key === CacheInfo.WegldTokenId().key) {
        return Promise.resolve('WEGLD-123456');
      }

      return Promise.resolve(undefined);
    });
    walletSigner.getAddress.mockReturnValue(userSignerAddress);

    service = module.get<GasCheckerService>(GasCheckerService);
  });

  it('Should check gas service fees and wallet tokens error', async () => {
    api.getAccount.mockRejectedValue(new Error('Invalid account'));

    await service.checkGasServiceAndWalletRaw();

    expect(gasServiceContract.getContractAddress).toHaveBeenCalledTimes(2);
    expect(api.getAccount).toHaveBeenCalledTimes(2);
    expect(api.getAccount).toHaveBeenCalledWith(gasServiceAddress);
    expect(api.getAccount).toHaveBeenCalledWith(userSignerAddress);
    expect(api.getFungibleTokenOfAccount).not.toHaveBeenCalled();
  });

  describe('checkGasServiceFees', () => {
    it('Should check gas service fees no fees to collect', async () => {
      api.getAccount.mockImplementation((address) => {
        if (address !== gasServiceAddress) {
          throw new Error('Invalid account');
        }

        return Promise.resolve(new AccountOnNetwork({ balance: new BigNumber('1000') }));
      });
      api.getFungibleTokenOfAccount.mockReturnValueOnce(
        Promise.resolve({
          identifier: 'WEGLD-123456',
          balance: new BigNumber('2000'),
          rawResponse: {},
        }),
      );

      await service.checkGasServiceAndWalletRaw();

      expect(gasServiceContract.getContractAddress).toHaveBeenCalledTimes(2);
      expect(api.getAccount).toHaveBeenCalledTimes(2);
      expect(api.getAccount).toHaveBeenCalledWith(gasServiceAddress);
      expect(api.getAccount).toHaveBeenCalledWith(userSignerAddress);
      expect(api.getFungibleTokenOfAccount).toHaveBeenCalledTimes(1);
      expect(api.getFungibleTokenOfAccount).toHaveBeenCalledWith(gasServiceAddress, 'WEGLD-123456');
      expect(gasServiceContract.collectFees).not.toHaveBeenCalled();
      expect(wegldSwapContract.unwrapEgld).not.toHaveBeenCalled();
    });

    const checkGasServiceFeesComplete = async (success: boolean) => {
      api.getAccount.mockImplementation((address) => {
        if (address !== gasServiceAddress) {
          throw new Error('Invalid account');
        }

        return Promise.resolve(new AccountOnNetwork({ balance: new BigNumber('300000000000000000') }));
      });
      api.getFungibleTokenOfAccount.mockRejectedValue(new Error('No wegld token for address'));

      const transaction: DeepMocked<Transaction> = createMock();
      gasServiceContract.collectFees.mockReturnValueOnce(transaction);
      transactionsHelper.signAndSendTransactionAndGetNonce.mockReturnValueOnce(Promise.resolve('txHash'));
      transactionsHelper.awaitSuccess.mockReturnValueOnce(Promise.resolve(success));

      await service.checkGasServiceAndWalletRaw();

      expect(gasServiceContract.getContractAddress).toHaveBeenCalledTimes(2);
      expect(api.getAccount).toHaveBeenCalledTimes(2);
      expect(api.getAccount).toHaveBeenCalledWith(gasServiceAddress);
      expect(api.getAccount).toHaveBeenCalledWith(userSignerAddress);
      expect(api.getFungibleTokenOfAccount).toHaveBeenCalledTimes(1);
      expect(api.getFungibleTokenOfAccount).toHaveBeenCalledWith(gasServiceAddress, 'WEGLD-123456');
      expect(gasServiceContract.collectFees).toHaveBeenCalledTimes(1);
      expect(gasServiceContract.collectFees).toHaveBeenCalledWith(
        userSignerAddress,
        ['EGLD'],
        [new BigNumber('200000000000000000')],
      );
      expect(transactionsHelper.signAndSendTransactionAndGetNonce).toHaveBeenCalledTimes(1);
      expect(transactionsHelper.signAndSendTransactionAndGetNonce).toHaveBeenCalledWith(transaction, walletSigner);
      expect(transactionsHelper.awaitSuccess).toHaveBeenCalledTimes(1);
      expect(transactionsHelper.awaitSuccess).toHaveBeenCalledWith('txHash');
      expect(wegldSwapContract.unwrapEgld).not.toHaveBeenCalled();
    };

    it('Should check gas service fees collect fees complete error', async () => {
      await checkGasServiceFeesComplete(false);
    });

    it('Should check gas service fees collect fees complete success', async () => {
      await checkGasServiceFeesComplete(true);
    });
  });

  describe('checkWalletTokens', () => {
    it('Should check wallet tokens low balance', async () => {
      api.getAccount.mockImplementation((address) => {
        if (address !== userSignerAddress) {
          throw new Error('Invalid account');
        }

        return Promise.resolve(new AccountOnNetwork({ balance: new BigNumber('1000') }));
      });
      api.getFungibleTokenOfAccount.mockRejectedValue(new Error('No wegld token for address'));

      await service.checkGasServiceAndWalletRaw();

      expect(gasServiceContract.getContractAddress).toHaveBeenCalledTimes(2);
      expect(api.getAccount).toHaveBeenCalledTimes(2);
      expect(api.getAccount).toHaveBeenCalledWith(gasServiceAddress);
      expect(api.getAccount).toHaveBeenCalledWith(userSignerAddress);
      expect(api.getFungibleTokenOfAccount).toHaveBeenCalledTimes(1);
      expect(api.getFungibleTokenOfAccount).toHaveBeenCalledWith(userSignerAddress, 'WEGLD-123456');
      expect(gasServiceContract.collectFees).not.toHaveBeenCalled();
      expect(wegldSwapContract.unwrapEgld).not.toHaveBeenCalled();

      // The low balance just logs an error, which can not be tested currently
    });

    const checkWalletTokensUnwrapComplete = async (complete: boolean) => {
      api.getAccount.mockImplementation((address) => {
        if (address !== userSignerAddress) {
          throw new Error('Invalid account');
        }

        return Promise.resolve(new AccountOnNetwork({ balance: new BigNumber('100000000000000000') }));
      });
      api.getFungibleTokenOfAccount.mockReturnValueOnce(
        Promise.resolve({
          identifier: 'WEGLD-123456',
          balance: new BigNumber('200000000000000000'),
          rawResponse: {},
        }),
      );

      const transaction: DeepMocked<Transaction> = createMock();
      wegldSwapContract.unwrapEgld.mockReturnValueOnce(transaction);
      transactionsHelper.signAndSendTransactionAndGetNonce.mockReturnValueOnce(Promise.resolve('txHash'));
      transactionsHelper.awaitSuccess.mockReturnValueOnce(Promise.resolve(complete));

      await service.checkGasServiceAndWalletRaw();

      expect(gasServiceContract.getContractAddress).toHaveBeenCalledTimes(2);
      expect(api.getAccount).toHaveBeenCalled();
      expect(api.getAccount).toHaveBeenCalledWith(gasServiceAddress);
      expect(api.getAccount).toHaveBeenCalledWith(userSignerAddress);
      expect(api.getFungibleTokenOfAccount).toHaveBeenCalledTimes(1);
      expect(api.getFungibleTokenOfAccount).toHaveBeenCalledWith(userSignerAddress, 'WEGLD-123456');
      expect(wegldSwapContract.unwrapEgld).toHaveBeenCalledTimes(1);
      expect(wegldSwapContract.unwrapEgld).toHaveBeenCalledWith(
        'WEGLD-123456',
        new BigNumber('200000000000000000'),
        userSignerAddress,
      );
      expect(transactionsHelper.signAndSendTransactionAndGetNonce).toHaveBeenCalledTimes(1);
      expect(transactionsHelper.signAndSendTransactionAndGetNonce).toHaveBeenCalledWith(transaction, walletSigner);
      expect(transactionsHelper.awaitSuccess).toHaveBeenCalledTimes(1);
      expect(transactionsHelper.awaitSuccess).toHaveBeenCalledWith('txHash');
      expect(gasServiceContract.collectFees).not.toHaveBeenCalled();
    };

    it('Should check wallet tokens unwrap complete error', async () => {
      await checkWalletTokensUnwrapComplete(false);

      // Only called 2 times (one for gas service and one for wallet)
      expect(api.getAccount).toHaveBeenCalledTimes(2);
    });

    it('Should check wallet tokens unwrap complete success', async () => {
      await checkWalletTokensUnwrapComplete(true);

      // Called 3 times, one more time for wallet
      expect(api.getAccount).toHaveBeenCalledTimes(3);
    });
  });
});
