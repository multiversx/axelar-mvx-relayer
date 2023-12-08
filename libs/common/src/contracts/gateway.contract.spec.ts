import { createMock, DeepMocked } from '@golevelup/ts-jest';
import { Test } from '@nestjs/testing';
import { BinaryUtils } from '@multiversx/sdk-nestjs-common';
import { Events } from '@mvx-monorepo/common/utils/event.enum';
import { AbiRegistry, Address, ResultsParser, SmartContract } from '@multiversx/sdk-core/out';
import { GatewayContract } from '@mvx-monorepo/common/contracts/gateway.contract';
import { TransactionEvent } from '@multiversx/sdk-network-providers/out';
import { NotifierEvent } from '../../../../apps/mvx-event-processor/src/event-processor/types';

import gatewayAbi from '../assets/gateway.abi.json';

describe('GatewayContract', () => {
  let smartContract: DeepMocked<SmartContract>;
  let abi: AbiRegistry;
  let resultsParser: ResultsParser;

  let contract: GatewayContract;

  beforeEach(async () => {
    smartContract = createMock();
    abi = AbiRegistry.create(gatewayAbi);
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
      order: 1,
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
});
