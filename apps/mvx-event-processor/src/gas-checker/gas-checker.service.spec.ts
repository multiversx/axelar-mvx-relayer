import { Test, TestingModule } from '@nestjs/testing';
import { GasCheckerService } from './gas-checker.service';
import { createMock, DeepMocked } from '@golevelup/ts-jest';
import { CacheInfo, GasServiceContract, TransactionsHelper, WegldSwapContract } from '@mvx-monorepo/common';
import { UserSigner } from '@multiversx/sdk-wallet/out';
import { ApiNetworkProvider } from '@multiversx/sdk-network-providers/out';
import { ProviderKeys } from '@mvx-monorepo/common/utils/provider.enum';
import { Address } from '@multiversx/sdk-core/out';
import { CacheService } from '@multiversx/sdk-nestjs-cache';
import { UserAddress } from '@multiversx/sdk-wallet/out/userAddress';

describe('GasCheckerService', () => {
  const gasServiceAddress = 'erd1qqqqqqqqqqqqqpgqhe8t5jewej70zupmh44jurgn29psua5l2jps3ntjj3';
  const userSignerAddress = 'erd1fsk0cnaag2m78gunfddsvg0y042rf0maxxgz6kvm32kxcl25m0yq8s38vt';

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

    gasServiceContract.getContractAddress.mockReturnValue(Address.fromBech32(gasServiceAddress));
    cacheService.getOrSet.mockImplementation((key) => {
      if (key === CacheInfo.WegldTokenId().key) {
        return Promise.resolve('WEGLD-123456');
      }

      return Promise.resolve(undefined);
    });
    const userAddress = UserAddress.fromBech32(userSignerAddress);
    walletSigner.getAddress.mockReturnValue(userAddress);

    service = module.get<GasCheckerService>(GasCheckerService);
  });

  it('Should check gas service fees and wallet tokens error', async () => {
    api.getAccount.mockRejectedValue(new Error('Invalid account'));

    await service.checkGasServiceAndWalletRaw();

    expect(gasServiceContract.getContractAddress).toHaveBeenCalledTimes(2);
    expect(api.getAccount).toHaveBeenCalledTimes(2);
    expect(api.getAccount).toHaveBeenCalledWith(Address.fromBech32(gasServiceAddress));
    expect(api.getAccount).toHaveBeenCalledWith(UserAddress.fromBech32(userSignerAddress));
    expect(api.getFungibleTokenOfAccount).not.toHaveBeenCalled();
  });
});
