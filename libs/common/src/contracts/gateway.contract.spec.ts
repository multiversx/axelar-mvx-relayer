import { createMock, DeepMocked } from '@golevelup/ts-jest';
import { Test } from '@nestjs/testing';
import { BinaryUtils } from '@multiversx/sdk-nestjs-common';
import { Events } from '@mvx-monorepo/common/utils/event.enum';
import { AbiRegistry, Address, BinaryCodec, ResultsParser, SmartContract } from '@multiversx/sdk-core/out';
import { GatewayContract } from '@mvx-monorepo/common/contracts/gateway.contract';
import { TransactionEvent } from '@multiversx/sdk-network-providers/out';
import { NotifierEvent } from '../../../../apps/mvx-event-processor/src/event-processor/types';

import gatewayAbi from '../assets/gateway.abi.json';
import authAbi from '../assets/auth.abi.json';
import { AuthContract } from '@mvx-monorepo/common/contracts/auth.contract';
import BigNumber from 'bignumber.js';
import { TransactionEventData } from '@multiversx/sdk-network-providers/out/transactionEvents';

describe('GatewayContract', () => {
  let smartContract: DeepMocked<SmartContract>;
  let abi: AbiRegistry;
  let resultsParser: ResultsParser;

  let authContract: AuthContract;
  let contract: GatewayContract;

  beforeEach(async () => {
    smartContract = createMock();
    abi = AbiRegistry.create(gatewayAbi); // use real Gateway contract abi
    resultsParser = new ResultsParser();
    authContract = new AuthContract(AbiRegistry.create(authAbi), new BinaryCodec());

    const moduleRef = await Test.createTestingModule({
      providers: [GatewayContract],
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

        if (token === AuthContract) {
          return authContract;
        }

        return null;
      })
      .compile();

    contract = moduleRef.get(GatewayContract);
  });

  describe('decodeContractCallEvent', () => {
    const data = Buffer.concat([
      Buffer.from('ebc84cbd75ba5516bf45e7024a9e12bc3c5c880f73e3a5beca7ebba52b2867a7', 'hex'),
      Buffer.from('00000007', 'hex'), // length of payload as u32
      Buffer.from('payload'),
    ]);
    const rawEvent: NotifierEvent = {
      txHash: 'txHash',
      address: 'mockGatewayAddress',
      identifier: 'callContract',
      data: data.toString('base64'),
      topics: [
        BinaryUtils.base64Encode(Events.CONTRACT_CALL_EVENT),
        Buffer.from(
          Address.fromBech32('erd1qqqqqqqqqqqqqpgqzqvm5ywqqf524efwrhr039tjs29w0qltkklsa05pk7').hex(),
          'hex',
        ).toString('base64'),
        BinaryUtils.base64Encode('ethereum'),
        BinaryUtils.base64Encode('destinationAddress'),
      ],
    };
    const event = TransactionEvent.fromHttpResponse(rawEvent);

    it('Should decode event', () => {
      const result = contract.decodeContractCallEvent(event);

      expect(result).toEqual({
        sender: Address.fromBech32('erd1qqqqqqqqqqqqqpgqzqvm5ywqqf524efwrhr039tjs29w0qltkklsa05pk7'),
        destinationChain: 'ethereum',
        destinationAddress: 'destinationAddress',
        data: {
          payloadHash: 'ebc84cbd75ba5516bf45e7024a9e12bc3c5c880f73e3a5beca7ebba52b2867a7',
          payload: Buffer.from('payload'),
        },
      });
    });

    it('Should throw error while decoding', () => {
      event.topics = [];

      expect(() => contract.decodeContractCallEvent(event)).toThrow();
    });
  });

  describe('decodeContractCallApprovedEvent', () => {
    const rawEvent: NotifierEvent = {
      txHash: 'txHash',
      address: 'mockGatewayAddress',
      identifier: 'callContract',
      data: '',
      topics: [
        BinaryUtils.base64Encode(Events.CONTRACT_CALL_APPROVED_EVENT),
        Buffer.from('0c38359b7a35c755573659d797afec315bb0e51374a056745abd9764715a15da', 'hex').toString('base64'),
        BinaryUtils.base64Encode('ethereum'),
        BinaryUtils.base64Encode('sourceAddress'),
        Buffer.from(
          Address.fromBech32('erd1qqqqqqqqqqqqqpgqzqvm5ywqqf524efwrhr039tjs29w0qltkklsa05pk7').hex(),
          'hex',
        ).toString('base64'),
        Buffer.from('ebc84cbd75ba5516bf45e7024a9e12bc3c5c880f73e3a5beca7ebba52b2867a7', 'hex').toString('base64'),
      ],
    };
    const event = TransactionEvent.fromHttpResponse(rawEvent);

    it('Should decode event', () => {
      const result = contract.decodeContractCallApprovedEvent(event);

      expect(result).toEqual({
        commandId: '0c38359b7a35c755573659d797afec315bb0e51374a056745abd9764715a15da',
        sourceChain: 'ethereum',
        sourceAddress: 'sourceAddress',
        contractAddress: Address.fromBech32('erd1qqqqqqqqqqqqqpgqzqvm5ywqqf524efwrhr039tjs29w0qltkklsa05pk7'),
        payloadHash: 'ebc84cbd75ba5516bf45e7024a9e12bc3c5c880f73e3a5beca7ebba52b2867a7',
      });
    });

    it('Should throw error while decoding', () => {
      event.topics = [];

      expect(() => contract.decodeContractCallApprovedEvent(event)).toThrow();
    });
  });

  describe('decodeOperatorshipTransferredEvent', () => {
    const rawEvent: NotifierEvent = {
      txHash: 'txHash',
      address: 'mockGatewayAddress',
      identifier: 'execute',
      data: Buffer.from(
        '000000018049d639e5a6980d1cd2392abcce41029cda74a1563523a202f09641cc2618f80000000100000001020000000102',
        'hex',
      ).toString('base64'),
      topics: [],
    };
    const event = TransactionEvent.fromHttpResponse(rawEvent);

    it('Should decode event', () => {
      const result = contract.decodeOperatorshipTransferredEvent(event);

      expect(result.newOperators).toEqual(['8049d639e5a6980d1cd2392abcce41029cda74a1563523a202f09641cc2618f8']);
      expect(result.newWeights).toEqual([new BigNumber('2')]);
      expect(result.newThreshold).toEqual(new BigNumber('2'));
    });

    it('Should throw error while decoding', () => {
      event.dataPayload = new TransactionEventData(Buffer.from(''));

      expect(() => contract.decodeOperatorshipTransferredEvent(event)).toThrow();
    });
  });

  describe('decodeContractCallExecutedEvent', () => {
    const rawEvent: NotifierEvent = {
      txHash: 'txHash',
      address: 'mockGatewayAddress',
      identifier: 'callContract',
      data: '',
      topics: [
        BinaryUtils.base64Encode(Events.CONTRACT_CALL_EXECUTED_EVENT),
        Buffer.from('0c38359b7a35c755573659d797afec315bb0e51374a056745abd9764715a15da', 'hex').toString('base64'),
      ],
    };
    const event = TransactionEvent.fromHttpResponse(rawEvent);

    it('Should decode event', () => {
      const result = contract.decodeContractCallExecutedEvent(event);

      expect(result).toEqual('0c38359b7a35c755573659d797afec315bb0e51374a056745abd9764715a15da');
    });

    it('Should throw error while decoding', () => {
      event.topics = [];

      expect(() => contract.decodeContractCallExecutedEvent(event)).toThrow();
    });
  });
});
