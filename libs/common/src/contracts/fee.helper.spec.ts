import { createMock, DeepMocked } from '@golevelup/ts-jest';
import { Test } from '@nestjs/testing';
import { TransactionPayload } from '@multiversx/sdk-core/out';
import { ProxyNetworkProvider } from '@multiversx/sdk-network-providers/out';
import { ApiConfigService } from '@mvx-monorepo/common';
import { FeeHelper } from '@mvx-monorepo/common/contracts/fee.helper';
import { NotEnoughGasError } from '@mvx-monorepo/common/contracts/entities/gas.error';

describe('FeeHelper', () => {
  let proxy: DeepMocked<ProxyNetworkProvider>;
  let apiConfigService: DeepMocked<ApiConfigService>;

  let feeHelper: FeeHelper;

  beforeEach(async () => {
    proxy = createMock();
    apiConfigService = createMock();

    const moduleRef = await Test.createTestingModule({
      providers: [FeeHelper],
    })
      .useMocker((token) => {
        if (token === ProxyNetworkProvider) {
          return proxy;
        }

        if (token === ApiConfigService) {
          return apiConfigService;
        }

        return null;
      })
      .compile();

    proxy.getNetworkConfig.mockImplementation((): Promise<any> => {
      return Promise.resolve({
        MinGasPrice: 1000000000,
        MinGasLimit: 50000,
        GasPerDataByte: 1500,
        GasPriceModifier: 0.01,
      });
    });
    apiConfigService.isEnabledGasCheck.mockReturnValueOnce(true);

    feeHelper = moduleRef.get(FeeHelper);
  });

  describe('checkGasCost', () => {
    it('Enough gas fee', () => {
      try {
        // @ts-ignore
        feeHelper.checkGasCost(10_000_000, 0, TransactionPayload.fromEncoded('test'), {
          availableGasBalance: '300000000000000', // 0.00003 EGLD
          sourceChain: 'ethereum',
          messageId: 'messageId',
        });

        expect(true).toEqual(true);
      } catch (e) {
        expect(false).toEqual(true);
      }
    });

    it('Not enough gas fee', () => {
      try {
        // @ts-ignore
        feeHelper.checkGasCost(10_000_000, 0, TransactionPayload.fromEncoded('test'), {
          availableGasBalance: '100000000000000', // 0.00001 EGLD
          sourceChain: 'ethereum',
          messageId: 'messageId',
        });

        expect(false).toEqual(true);
      } catch (e) {
        expect(e).toEqual(new NotEnoughGasError());
      }

      try {
        // @ts-ignore
        feeHelper.checkGasCost(10_000_000, 0, TransactionPayload.fromEncoded('test'), {
          availableGasBalance: '-100000000000000', // negative value
          sourceChain: 'ethereum',
          messageId: 'messageId',
        });

        expect(false).toEqual(true);
      } catch (e) {
        expect(e).toEqual(new NotEnoughGasError());
      }
    });
  });

  it('getGasLimitFromEgldFee', () => {
    expect(
      feeHelper.getGasLimitFromEgldFee(
        BigInt(608621610000000),
        TransactionPayload.fromEncoded(
          'c2V0UmVtb3RlVmFsdWVANjE3NjYxNmM2MTZlNjM2ODY1MmQ2Njc1NmE2OUAzMDc4NjM0NTM0MzEzMDMzMzgzNjM3NDM0MzM0NDI2NjYyMzIzMzM4MzI0NTM2NDQzMDQyMzc0NjM4Mzg2NTM2NDUzMzQ2Mzg0NDM1MzYzMzQ0MzZAMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAyMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMTI0ODY1NmM2YzZmMjA3NzZmNzI2YzY0MjA2MTY3NjE2OTZlMjEwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAw',
        ),
      ),
    ).toBe(BigInt(7712161));

    expect(
      feeHelper.getGasLimitFromEgldFee(
        BigInt(726185000000000),
        TransactionPayload.fromEncoded(
          'c2V0UmVtb3RlVmFsdWVANjE3NjYxNmM2MTZlNjM2ODY1MmQ2Njc1NmE2OUAzMDc4NjM0NTM0MzEzMDMzMzgzNjM3NDM0MzM0NDI2NjYyMzIzMzM4MzI0NTM2NDQzMDQyMzc0NjM4Mzg2NTM2NDUzMzQ2Mzg0NDM1MzYzMzQ0MzZAMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAyMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMTI0ODY1NmM2YzZmMjA3NzZmNzI2YzY0MjA2MTY3NjE2OTZlMjEwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAw',
        ),
      ),
    ).toBe(BigInt(19468500));

    expect(
      feeHelper.getGasLimitFromEgldFee(
        BigInt(508621610000000),
        TransactionPayload.fromEncoded(
          'c2V0UmVtb3RlVmFsdWVANjE3NjYxNmM2MTZlNjM2ODY1MmQ2Njc1NmE2OUAzMDc4NjM0NTM0MzEzMDMzMzgzNjM3NDM0MzM0NDI2NjYyMzIzMzM4MzI0NTM2NDQzMDQyMzc0NjM4Mzg2NTM2NDUzMzQ2Mzg0NDM1MzYzMzQ0MzZAMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAyMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMTI0ODY1NmM2YzZmMjA3NzZmNzI2YzY0MjA2MTY3NjE2OTZlMjEwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAw',
        ),
      ),
    ).toBe(BigInt(531500));

    expect(
      feeHelper.getGasLimitFromEgldFee(
        BigInt(588621610000000),
        TransactionPayload.fromEncoded(
          'c2V0UmVtb3RlVmFsdWVANjE3NjYxNmM2MTZlNjM2ODY1MmQ2Njc1NmE2OUAzMDc4NjM0NTM0MzEzMDMzMzgzNjM3NDM0MzM0NDI2NjYyMzIzMzM4MzI0NTM2NDQzMDQyMzc0NjM4Mzg2NTM2NDUzMzQ2Mzg0NDM1MzYzMzQ0MzZAMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAyMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMTI0ODY1NmM2YzZmMjA3NzZmNzI2YzY0MjA2MTY3NjE2OTZlMjEwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAw',
        ),
      ),
    ).toBe(BigInt(5712161));

    // Larger data
    expect(
      feeHelper.getGasLimitFromEgldFee(
        BigInt(588621610000000),
        TransactionPayload.fromEncoded(
          'c2V0UmVtb3RlVmFsdWVANjE3NjYxNmM2MTZlNjM2ODY1MmQ2Njc1NmE2OUAzMDc4NjM0NTM0MzEzMDMzMzgzNjM3NDM0MzM0NDI2NjYyMzIzMzM4MzI0NTM2NDQzMDQyMzc0NjM4Mzg2NTM2NDUzMzQ2Mzg0NDM1MzYzMzQ0MzZAMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAyMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMTI0ODY1NmM2YzZmMjA3NzZmNzI2YzY0MjA2MTY3NjE2OTZlMjEwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDA',
        ),
      ),
    ).toBe(BigInt(4512161));

    // Smaller data
    expect(
      feeHelper.getGasLimitFromEgldFee(
        BigInt(588621610000000),
        TransactionPayload.fromEncoded(
          'c2V0UmVtb3RlVmFsdWU=',
        ),
      ),
    ).toBe(BigInt(51762161));

    expect(
      feeHelper.getGasLimitFromEgldFee(
        BigInt(-1000),
        TransactionPayload.fromEncoded(
          'c2V0UmVtb3RlVmFsdWU=',
        ),
      ),
    ).toBe(BigInt(71000));
  });

  it('getEgldFeeFromGasLimit', () => {
    expect(
      feeHelper.getEgldFeeFromGasLimit(
        BigInt(8243661),
        BigInt(321)
      ),
    ).toBe(BigInt(613936610000000));

    expect(
      feeHelper.getEgldFeeFromGasLimit(
        BigInt(6000000),
        BigInt(321)
      ),
    ).toBe(BigInt(591500000000000));


    expect(
      feeHelper.getEgldFeeFromGasLimit(
        BigInt(20000000),
        BigInt(321)
      ),
    ).toBe(BigInt(731500000000000));

    // Larger data
    expect(
      feeHelper.getEgldFeeFromGasLimit(
        BigInt(20000000),
        BigInt(350)
      ),
    ).toBe(BigInt(775000000000000));

    // Smaller data
    expect(
      feeHelper.getEgldFeeFromGasLimit(
        BigInt(20000000),
        BigInt(300)
      ),
    ).toBe(BigInt(700000000000000));
  });
});
