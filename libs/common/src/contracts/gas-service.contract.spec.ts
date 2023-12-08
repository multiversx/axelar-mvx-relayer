import { createMock, DeepMocked } from '@golevelup/ts-jest';
import { Test } from '@nestjs/testing';
import { BinaryUtils } from '@multiversx/sdk-nestjs-common';
import { Events } from '@mvx-monorepo/common/utils/event.enum';
import { AbiRegistry, Address, ResultsParser, SmartContract } from '@multiversx/sdk-core/out';
import { TransactionEvent } from '@multiversx/sdk-network-providers/out';
import { NotifierEvent } from '../../../../apps/mvx-event-processor/src/event-processor/types';
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

  describe('decodeGasPaidForContractCallEvent', () => {
    const data = Buffer.concat([
      Buffer.from('ebc84cbd75ba5516bf45e7024a9e12bc3c5c880f73e3a5beca7ebba52b2867a7', 'hex'),
      Buffer.from('00000005', 'hex'), // length of token as u32
      Buffer.from('token'),
      Buffer.from('00000002', 'hex'), // length of amount as u32
      Buffer.from('03e8', 'hex'), // 1000 in hex
      Buffer.from('000000000000000005001019ba11c00268aae52e1dc6f89572828ae783ebb5bf', 'hex'),
    ]);
    const rawEvent: NotifierEvent = {
      txHash: 'txHash',
      address: 'mockGasServiceAddress',
      identifier: 'any',
      data: data.toString('base64'),
      topics: [
        BinaryUtils.base64Encode(Events.GAS_PAID_FOR_CONTRACT_CALL_EVENT),
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
});
