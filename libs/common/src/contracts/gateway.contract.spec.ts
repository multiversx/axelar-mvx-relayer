import { createMock, DeepMocked } from '@golevelup/ts-jest';
import { Test } from '@nestjs/testing';
import { BinaryUtils } from '@multiversx/sdk-nestjs-common';
import { Events } from '@mvx-monorepo/common/utils/event.enum';
import { AbiRegistry, Address, ResultsParser, SmartContract } from '@multiversx/sdk-core/out';
import { GatewayContract } from '@mvx-monorepo/common/contracts/gateway.contract';
import { TransactionEvent } from '@multiversx/sdk-network-providers/out';
import { NotifierEvent } from '../../../../apps/mvx-event-processor/src/event-processor/types';

import gatewayAbi from '../assets/gateway.abi.json';
import BigNumber from 'bignumber.js';
import { TransactionEventData } from '@multiversx/sdk-network-providers/out/transactionEvents';

describe('GatewayContract', () => {
  let smartContract: DeepMocked<SmartContract>;
  let abi: AbiRegistry;
  let resultsParser: ResultsParser;

  let contract: GatewayContract;

  beforeEach(async () => {
    smartContract = createMock();
    abi = AbiRegistry.create(gatewayAbi); // use real Gateway contract abi
    resultsParser = new ResultsParser();

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

        // chainId
        if (token === String) {
          return 'test';
        }

        return null;
      })
      .compile();

    contract = moduleRef.get(GatewayContract);
  });

  describe('decodeContractCallEvent', () => {
    const data = Buffer.from('payload');

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
        Buffer.from('ebc84cbd75ba5516bf45e7024a9e12bc3c5c880f73e3a5beca7ebba52b2867a7', 'hex').toString('base64'),
      ],
    };
    const event = TransactionEvent.fromHttpResponse(rawEvent);

    it('Should decode event', () => {
      const result = contract.decodeContractCallEvent(event);

      expect(result).toEqual({
        sender: Address.fromBech32('erd1qqqqqqqqqqqqqpgqzqvm5ywqqf524efwrhr039tjs29w0qltkklsa05pk7'),
        destinationChain: 'ethereum',
        destinationAddress: 'destinationAddress',
        payloadHash: 'ebc84cbd75ba5516bf45e7024a9e12bc3c5c880f73e3a5beca7ebba52b2867a7',
        payload: Buffer.from('payload'),
      });
    });

    it('Should throw error while decoding', () => {
      event.topics = [];

      expect(() => contract.decodeContractCallEvent(event)).toThrow();
    });
  });

  describe('decodeMessageApprovedEvent', () => {
    const rawEvent: NotifierEvent = {
      txHash: 'txHash',
      address: 'mockGatewayAddress',
      identifier: 'approveMessages',
      data: '',
      topics: [
        BinaryUtils.base64Encode(Events.MESSAGE_APPROVED_EVENT),
        Buffer.from('0c38359b7a35c755573659d797afec315bb0e51374a056745abd9764715a15da', 'hex').toString('base64'),
        BinaryUtils.base64Encode('ethereum'),
        BinaryUtils.base64Encode('messageId'),
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
      const result = contract.decodeMessageApprovedEvent(event);

      expect(result).toEqual({
        commandId: '0c38359b7a35c755573659d797afec315bb0e51374a056745abd9764715a15da',
        sourceChain: 'ethereum',
        sourceAddress: 'sourceAddress',
        messageId: 'messageId',
        contractAddress: Address.fromBech32('erd1qqqqqqqqqqqqqpgqzqvm5ywqqf524efwrhr039tjs29w0qltkklsa05pk7'),
        payloadHash: 'ebc84cbd75ba5516bf45e7024a9e12bc3c5c880f73e3a5beca7ebba52b2867a7',
      });
    });

    it('Should throw error while decoding', () => {
      event.topics = [];

      expect(() => contract.decodeMessageApprovedEvent(event)).toThrow();
    });
  });

  describe('decodeSignersRotatedEvent', () => {
    const rawEvent: NotifierEvent = {
      txHash: 'txHash',
      address: 'mockGatewayAddress',
      identifier: 'rotateSigners',
      data: Buffer.from(
        '000000030139472eff6886771a982f3083da5d421f24c29181e63888228dc81ca60d69e100000001018049d639e5a6980d1cd2392abcce41029cda74a1563523a202f09641cc2618f80000000101b2a11555ce521e4944e09ab17549d85b487dcd26c84b5017a39e31a3670889ba00000001010000000103290decd9548b62a8d60345a988386fc84ba6bc95484008f6362f93160ef3e563',
        'hex',
      ).toString('base64'),
      topics: [
        BinaryUtils.base64Encode(Events.SIGNERS_ROTATED_EVENT),
        BinaryUtils.hexToBase64('01'),
        Buffer.from('0c38359b7a35c755573659d797afec315bb0e51374a056745abd9764715a15da', 'hex').toString('base64'),
      ],
    };
    const event = TransactionEvent.fromHttpResponse(rawEvent);

    it('Should decode event', () => {
      const result = contract.decodeSignersRotatedEvent(event);

      expect(result.epoch).toEqual(new BigNumber('1'));
      expect(result.signersHash).toEqual('0c38359b7a35c755573659d797afec315bb0e51374a056745abd9764715a15da');
      expect(result.signers).toEqual([
        { signer: '0139472eff6886771a982f3083da5d421f24c29181e63888228dc81ca60d69e1', weight: new BigNumber('1') },
        { signer: '8049d639e5a6980d1cd2392abcce41029cda74a1563523a202f09641cc2618f8', weight: new BigNumber('1') },
        { signer: 'b2a11555ce521e4944e09ab17549d85b487dcd26c84b5017a39e31a3670889ba', weight: new BigNumber('1') },
      ]);
      expect(result.threshold).toEqual(new BigNumber('3'));
      expect(result.nonce).toEqual('290decd9548b62a8d60345a988386fc84ba6bc95484008f6362f93160ef3e563');
    });

    it('Should throw error while decoding', () => {
      event.dataPayload = new TransactionEventData(Buffer.from(''));

      expect(() => contract.decodeSignersRotatedEvent(event)).toThrow();
    });
  });

  describe('decodeMessageExecutedEvent', () => {
    const rawEvent: NotifierEvent = {
      txHash: 'txHash',
      address: 'mockGatewayAddress',
      identifier: 'validateMessage',
      data: '',
      topics: [
        BinaryUtils.base64Encode(Events.MESSAGE_EXECUTED_EVENT),
        Buffer.from('0c38359b7a35c755573659d797afec315bb0e51374a056745abd9764715a15da', 'hex').toString('base64'),
        BinaryUtils.base64Encode('ethereum'),
        BinaryUtils.base64Encode('messageId'),
      ],
    };
    const event = TransactionEvent.fromHttpResponse(rawEvent);

    it('Should decode event', () => {
      const result = contract.decodeMessageExecutedEvent(event);

      expect(result).toEqual({
        commandId: '0c38359b7a35c755573659d797afec315bb0e51374a056745abd9764715a15da',
        sourceChain: 'ethereum',
        messageId: 'messageId',
      });
    });

    it('Should throw error while decoding', () => {
      event.topics = [];

      expect(() => contract.decodeMessageExecutedEvent(event)).toThrow();
    });
  });
});
