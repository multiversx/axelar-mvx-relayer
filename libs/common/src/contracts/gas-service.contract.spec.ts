import { createMock, DeepMocked } from '@golevelup/ts-jest';
import { Test } from '@nestjs/testing';
import { BinaryUtils } from '@multiversx/sdk-nestjs-common';
import { Events } from '@mvx-monorepo/common/utils/event.enum';
import { AbiRegistry, Address, ResultsParser, SmartContract } from '@multiversx/sdk-core/out';
import { TransactionEvent } from '@multiversx/sdk-network-providers/out';
import { GasServiceContract } from '@mvx-monorepo/common/contracts/gas-service.contract';

import gasServiceAbi from '../assets/gas-service.abi.json';
import BigNumber from 'bignumber.js';

describe('GasServiceContract', () => {
  let smartContract: DeepMocked<SmartContract>;
  let abi: AbiRegistry;
  let resultsParser: ResultsParser;

  let contract: GasServiceContract;

  beforeEach(async () => {
    smartContract = createMock();
    abi = AbiRegistry.create(gasServiceAbi);
    resultsParser = new ResultsParser();

    const moduleRef = await Test.createTestingModule({
      providers: [GasServiceContract],
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

    contract = moduleRef.get(GasServiceContract);
  });

  const getGasPaidEvent = (event: string, data: Buffer): TransactionEvent =>
    TransactionEvent.fromHttpResponse({
      address: 'mockGasServiceAddress',
      identifier: 'any',
      data: data.toString('base64'),
      topics: [
        BinaryUtils.base64Encode(event),
        Buffer.from(
          Address.fromBech32('erd1qqqqqqqqqqqqqpgqzqvm5ywqqf524efwrhr039tjs29w0qltkklsa05pk7').hex(),
          'hex',
        ).toString('base64'),
        BinaryUtils.base64Encode('ethereum'),
        BinaryUtils.base64Encode('destinationAddress'),
      ],
    });

  describe('decodeGasPaidForContractCallEvent', () => {
    const data = Buffer.concat([
      Buffer.from('ebc84cbd75ba5516bf45e7024a9e12bc3c5c880f73e3a5beca7ebba52b2867a7', 'hex'),
      Buffer.from('00000005', 'hex'), // length of token as u32
      Buffer.from('token'),
      Buffer.from('00000002', 'hex'), // length of amount as u32
      Buffer.from('03e8', 'hex'), // 1000 in hex
      Buffer.from('000000000000000005001019ba11c00268aae52e1dc6f89572828ae783ebb5bf', 'hex'),
    ]);
    const event = getGasPaidEvent(Events.GAS_PAID_FOR_CONTRACT_CALL_EVENT, data);

    it('Should decode event', () => {
      const result = contract.decodeGasPaidForContractCallEvent(event);

      expect(result).toEqual({
        sender: Address.fromBech32('erd1qqqqqqqqqqqqqpgqzqvm5ywqqf524efwrhr039tjs29w0qltkklsa05pk7'),
        destinationChain: 'ethereum',
        destinationAddress: 'destinationAddress',
        data: {
          payloadHash: 'ebc84cbd75ba5516bf45e7024a9e12bc3c5c880f73e3a5beca7ebba52b2867a7',
          gasToken: 'token',
          gasFeeAmount: new BigNumber('1000'),
          refundAddress: Address.fromBech32('erd1qqqqqqqqqqqqqpgqzqvm5ywqqf524efwrhr039tjs29w0qltkklsa05pk7'),
        },
      });
    });

    it('Should throw error while decoding', () => {
      event.topics = [];

      expect(() => contract.decodeGasPaidForContractCallEvent(event)).toThrow();
    });
  });

  describe('decodeNativeGasPaidForContractCallEvent', () => {
    const data = Buffer.concat([
      Buffer.from('ebc84cbd75ba5516bf45e7024a9e12bc3c5c880f73e3a5beca7ebba52b2867a7', 'hex'),
      Buffer.from('00000002', 'hex'), // length of amount as u32
      Buffer.from('03e8', 'hex'), // 1000 in hex
      Buffer.from('000000000000000005001019ba11c00268aae52e1dc6f89572828ae783ebb5bf', 'hex'),
    ]);
    const event = getGasPaidEvent(Events.GAS_PAID_FOR_CONTRACT_CALL_EVENT, data);

    it('Should decode event', () => {
      const result = contract.decodeNativeGasPaidForContractCallEvent(event);

      expect(result).toEqual({
        sender: Address.fromBech32('erd1qqqqqqqqqqqqqpgqzqvm5ywqqf524efwrhr039tjs29w0qltkklsa05pk7'),
        destinationChain: 'ethereum',
        destinationAddress: 'destinationAddress',
        data: {
          payloadHash: 'ebc84cbd75ba5516bf45e7024a9e12bc3c5c880f73e3a5beca7ebba52b2867a7',
          gasToken: null,
          gasFeeAmount: new BigNumber('1000'),
          refundAddress: Address.fromBech32('erd1qqqqqqqqqqqqqpgqzqvm5ywqqf524efwrhr039tjs29w0qltkklsa05pk7'),
        },
      });
    });

    it('Should throw error while decoding', () => {
      event.topics = [];

      expect(() => contract.decodeNativeGasPaidForContractCallEvent(event)).toThrow();
    });
  });

  const getGasAddedEvent = (event: string, data: Buffer): TransactionEvent =>
    TransactionEvent.fromHttpResponse({
      address: 'mockGasServiceAddress',
      identifier: 'any',
      data: data.toString('base64'),
      topics: [
        BinaryUtils.base64Encode(event),
        Buffer.from('ebc84cbd75ba5516bf45e7024a9e12bc3c5c880f73e3a5beca7ebba52b2867a7', 'hex').toString('base64'),
        BinaryUtils.hexToBase64('01'),
      ],
    });

  describe('decodeGasAddedEvent', () => {
    const data = Buffer.concat([
      Buffer.from('00000005', 'hex'), // length of token as u32
      Buffer.from('token'),
      Buffer.from('00000002', 'hex'), // length of amount as u32
      Buffer.from('03e8', 'hex'), // 1000 in hex
      Buffer.from('000000000000000005001019ba11c00268aae52e1dc6f89572828ae783ebb5bf', 'hex'),
    ]);
    const event = getGasAddedEvent(Events.GAS_ADDED_EVENT, data);

    it('Should decode event', () => {
      const result = contract.decodeGasAddedEvent(event);

      expect(result).toEqual({
        txHash: 'ebc84cbd75ba5516bf45e7024a9e12bc3c5c880f73e3a5beca7ebba52b2867a7',
        logIndex: 1,
        data: {
          gasToken: 'token',
          gasFeeAmount: new BigNumber('1000'),
          refundAddress: Address.fromBech32('erd1qqqqqqqqqqqqqpgqzqvm5ywqqf524efwrhr039tjs29w0qltkklsa05pk7'),
        },
      });
    });

    it('Should throw error while decoding', () => {
      event.topics = [];

      expect(() => contract.decodeGasAddedEvent(event)).toThrow();
    });
  });

  describe('decodeNativeGasAddedEvent', () => {
    const data = Buffer.concat([
      Buffer.from('00000002', 'hex'), // length of amount as u32
      Buffer.from('03e8', 'hex'), // 1000 in hex
      Buffer.from('000000000000000005001019ba11c00268aae52e1dc6f89572828ae783ebb5bf', 'hex'),
    ]);
    const event = getGasAddedEvent(Events.NATIVE_GAS_ADDED_EVENT, data);

    it('Should decode event', () => {
      const result = contract.decodeNativeGasAddedEvent(event);

      expect(result).toEqual({
        txHash: 'ebc84cbd75ba5516bf45e7024a9e12bc3c5c880f73e3a5beca7ebba52b2867a7',
        logIndex: 1,
        data: {
          gasToken: null,
          gasFeeAmount: new BigNumber('1000'),
          refundAddress: Address.fromBech32('erd1qqqqqqqqqqqqqpgqzqvm5ywqqf524efwrhr039tjs29w0qltkklsa05pk7'),
        },
      });
    });

    it('Should throw error while decoding', () => {
      event.topics = [];

      expect(() => contract.decodeNativeGasAddedEvent(event)).toThrow();
    });
  });

  describe('decodeRefundedEvent', () => {
    it('Should decode event egld', () => {
      const data = Buffer.concat([
        Buffer.from('000000000000000005001019ba11c00268aae52e1dc6f89572828ae783ebb5bf', 'hex'),
        Buffer.from('00000004', 'hex'), // length of token as u32
        Buffer.from('EGLD'),
        Buffer.from('00000002', 'hex'), // length of amount as u32
        Buffer.from('03e8', 'hex'), // 1000 in hex
      ]);
      const event = getGasAddedEvent(Events.REFUNDED_EVENT, data);

      const result = contract.decodeRefundedEvent(event);

      expect(result).toEqual({
        txHash: 'ebc84cbd75ba5516bf45e7024a9e12bc3c5c880f73e3a5beca7ebba52b2867a7',
        logIndex: 1,
        data: {
          receiver: Address.fromBech32('erd1qqqqqqqqqqqqqpgqzqvm5ywqqf524efwrhr039tjs29w0qltkklsa05pk7'),
          token: null,
          amount: new BigNumber('1000'),
        },
      });
    });

    const data = Buffer.concat([
      Buffer.from('000000000000000005001019ba11c00268aae52e1dc6f89572828ae783ebb5bf', 'hex'),
      Buffer.from('00000005', 'hex'), // length of token as u32
      Buffer.from('token'),
      Buffer.from('00000002', 'hex'), // length of amount as u32
      Buffer.from('03e8', 'hex'), // 1000 in hex
    ]);
    const event = getGasAddedEvent(Events.REFUNDED_EVENT, data);

    it('Should decode event token', () => {
      const result = contract.decodeRefundedEvent(event);

      expect(result).toEqual({
        txHash: 'ebc84cbd75ba5516bf45e7024a9e12bc3c5c880f73e3a5beca7ebba52b2867a7',
        logIndex: 1,
        data: {
          receiver: Address.fromBech32('erd1qqqqqqqqqqqqqpgqzqvm5ywqqf524efwrhr039tjs29w0qltkklsa05pk7'),
          token: 'token',
          amount: new BigNumber('1000'),
        },
      });
    });

    it('Should throw error while decoding', () => {
      event.topics = [];

      expect(() => contract.decodeRefundedEvent(event)).toThrow();
    });
  });
});
