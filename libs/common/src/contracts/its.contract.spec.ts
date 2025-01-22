import { createMock, DeepMocked } from '@golevelup/ts-jest';
import { Test } from '@nestjs/testing';
import { BinaryUtils } from '@multiversx/sdk-nestjs-common';
import { AbiRegistry, Address, ResultsParser, SmartContract } from '@multiversx/sdk-core/out';
import { TransactionEvent } from '@multiversx/sdk-network-providers/out';

import itsAbi from '../assets/interchain-token-service.abi.json';
import BigNumber from 'bignumber.js';
import { ItsContract } from '@mvx-monorepo/common/contracts/its.contract';

describe('ItsContract', () => {
  let smartContract: DeepMocked<SmartContract>;
  let abi: AbiRegistry;
  let resultsParser: ResultsParser;

  let contract: ItsContract;

  beforeEach(async () => {
    smartContract = createMock();
    abi = AbiRegistry.create(itsAbi);
    resultsParser = new ResultsParser();

    const moduleRef = await Test.createTestingModule({
      providers: [ItsContract],
    })
      .useMocker((token) => {
        if (token === SmartContract) {
          return smartContract;
        }

        if (token === AbiRegistry) {
          return abi;
        }

        if (token === ResultsParser) {
          return resultsParser;
        }

        return null;
      })
      .compile();

    contract = moduleRef.get(ItsContract);
  });

  describe('decodeInterchainTokenDeploymentStartedEvent', () => {
    const event = TransactionEvent.fromHttpResponse({
      address: 'mockItsAddress',
      identifier: 'any',
      data: Buffer.from(
        '0000000c49545354657374546f6b656e00000005495453545412000000000000000e6176616c616e6368652d66756a69',
        'hex',
      ).toString('base64'),
      topics: [
        BinaryUtils.base64Encode('interchain_token_deployment_started_event'),
        Buffer.from('81748eb162a0c2c245b3fb7f29e125edf1a95cf01712d21e20a7594add9d82cd', 'hex').toString('base64'),
      ],
    });

    it('Should decode event', () => {
      const result = contract.decodeInterchainTokenDeploymentStartedEvent(event);

      expect(result).toEqual({
        tokenId: '81748eb162a0c2c245b3fb7f29e125edf1a95cf01712d21e20a7594add9d82cd',
        name: 'ITSTestToken',
        symbol: 'ITSTT',
        decimals: 18,
        minter: Buffer.from(''),
        destinationChain: 'avalanche-fuji',
      });
    });

    it('Should throw error while decoding', () => {
      event.topics = [];

      expect(() => contract.decodeInterchainTokenDeploymentStartedEvent(event)).toThrow();
    });
  });

  describe('decodeInterchainTransferEvent', () => {
    const event = TransactionEvent.fromHttpResponse({
      address: 'mockItsAddress',
      identifier: 'any',
      data: Buffer.from(
        '0000000e6176616c616e6368652d66756a6900000014f12372616f9c986355414ba06b3ca954c0a7b0dc0000000a152d02c7e14af6800000',
        'hex',
      ).toString('base64'),
      topics: [
        BinaryUtils.base64Encode('interchain_transfer_event'),
        Buffer.from('81748eb162a0c2c245b3fb7f29e125edf1a95cf01712d21e20a7594add9d82cd', 'hex').toString('base64'),
        Buffer.from(
          Address.fromBech32('erd1wavgcxq9tfyrw49k3s3h34085mayu82wqvpd4h6akyh8559pkklsknwhwh').hex(),
          'hex',
        ).toString('base64'),
        Buffer.from('0000000000000000000000000000000000000000000000000000000000000000', 'hex').toString('base64'),
      ],
    });

    it('Should decode event', () => {
      const result = contract.decodeInterchainTransferEvent(event);

      expect(result).toEqual({
        tokenId: '81748eb162a0c2c245b3fb7f29e125edf1a95cf01712d21e20a7594add9d82cd',
        sourceAddress: Address.fromBech32('erd1wavgcxq9tfyrw49k3s3h34085mayu82wqvpd4h6akyh8559pkklsknwhwh'),
        dataHash: '0000000000000000000000000000000000000000000000000000000000000000',
        destinationChain: 'avalanche-fuji',
        destinationAddress: Buffer.from('F12372616f9c986355414BA06b3Ca954c0a7b0dC', 'hex'),
        amount: new BigNumber('100000000000000000000000'),
      });
    });

    it('Should throw error while decoding', () => {
      event.topics = [];

      expect(() => contract.decodeInterchainTokenDeploymentStartedEvent(event)).toThrow();
    });
  });
});
