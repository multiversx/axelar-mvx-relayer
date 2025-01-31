import { Test, TestingModule } from '@nestjs/testing';
import { createMock, DeepMocked } from '@golevelup/ts-jest';
import { BinaryUtils } from '@multiversx/sdk-nestjs-common';
import { Events } from '@mvx-monorepo/common/utils/event.enum';
import { Address, ITransactionEvent } from '@multiversx/sdk-core/out';
import { TransactionEvent, TransactionOnNetwork } from '@multiversx/sdk-network-providers/out';
import BigNumber from 'bignumber.js';
import { ItsProcessor } from './its.processor';
import { ItsContract } from '@mvx-monorepo/common/contracts/its.contract';
import {
  InterchainTokenDeploymentStartedEvent,
  InterchainTransferEvent,
} from '@mvx-monorepo/common/contracts/entities/its-events';
import { Components } from '@mvx-monorepo/common/api/entities/axelar.gmp.api';
import ITSInterchainTokenDeploymentStartedEvent = Components.Schemas.ITSInterchainTokenDeploymentStartedEvent;
import ITSInterchainTransferEvent = Components.Schemas.ITSInterchainTransferEvent;

const mockItsContract = 'erd1qqqqqqqqqqqqqqqpqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqplllst77y4l';

describe('ItsProcessor', () => {
  let itsContract: DeepMocked<ItsContract>;

  let service: ItsProcessor;

  beforeEach(async () => {
    itsContract = createMock();

    const module: TestingModule = await Test.createTestingModule({
      providers: [ItsProcessor],
    })
      .useMocker((token) => {
        if (token === ItsContract) {
          return itsContract;
        }

        return null;
      })
      .compile();

    service = module.get<ItsProcessor>(ItsProcessor);
  });

  it('Should not handle event', () => {
    const rawEvent: ITransactionEvent = TransactionEvent.fromHttpResponse({
      address: 'erd1qqqqqqqqqqqqqqqpqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqplllst77y4l',
      identifier: 'callContract',
      data: '',
      topics: [BinaryUtils.base64Encode(Events.CONTRACT_CALL_EVENT)],
    });

    const result = service.handleItsEvent(rawEvent, createMock(), 0);

    expect(result).toBeUndefined();
    expect(itsContract.decodeInterchainTokenDeploymentStartedEvent).not.toHaveBeenCalled();
    expect(itsContract.decodeInterchainTransferEvent).not.toHaveBeenCalled();
  });

  describe('Handle interchain token deployment started event', () => {
    const rawEvent: TransactionEvent = TransactionEvent.fromHttpResponse({
      address: mockItsContract,
      identifier: 'any',
      data: '',
      topics: [BinaryUtils.base64Encode(Events.INTERCHAIN_TOKEN_DEPLOYMENT_STARTED_EVENT)],
    });

    const interchainTokenDeploymentStartedEvent: InterchainTokenDeploymentStartedEvent = {
      tokenId: '0c38359b7a35c755573659d797afec315bb0e51374a056745abd9764715a15da',
      name: 'name',
      symbol: 'symbol',
      decimals: 6,
      minter: Buffer.from('F12372616f9c986355414BA06b3Ca954c0a7b0dC', 'hex'),
      destinationChain: 'ethereum',
    };

    it('Should handle', () => {
      itsContract.decodeInterchainTokenDeploymentStartedEvent.mockReturnValueOnce(
        interchainTokenDeploymentStartedEvent,
      );

      const transaction = createMock<TransactionOnNetwork>();
      transaction.hash = 'txHash';
      transaction.sender = Address.fromBech32('erd1qqqqqqqqqqqqqpgqzqvm5ywqqf524efwrhr039tjs29w0qltkklsa05pk7');

      const result = service.handleItsEvent(rawEvent, transaction, 1);

      expect(result).not.toBeUndefined();
      expect(result?.type).toBe('ITS/INTERCHAIN_TOKEN_DEPLOYMENT_STARTED');

      const event = result as ITSInterchainTokenDeploymentStartedEvent;

      expect(event.eventID).toBe('0xtxHash-1');
      expect(event.messageID).toBe('0xtxHash-0');
      expect(event.destinationChain).toBe(interchainTokenDeploymentStartedEvent.destinationChain);
      expect(event.token).toEqual({
        id: `0x${interchainTokenDeploymentStartedEvent.tokenId}`,
        name: interchainTokenDeploymentStartedEvent.name,
        symbol: interchainTokenDeploymentStartedEvent.symbol,
        decimals: interchainTokenDeploymentStartedEvent.decimals,
      });
      expect(event.meta).toEqual({
        txID: 'txHash',
        fromAddress: transaction.sender.bech32(),
        finalized: true,
      });
    });
  });

  describe('Handle interchain transfer event', () => {
    const rawEvent: TransactionEvent = TransactionEvent.fromHttpResponse({
      address: mockItsContract,
      identifier: 'any',
      data: '',
      topics: [BinaryUtils.base64Encode(Events.INTERCHAIN_TRANSFER_EVENT)],
    });

    const interchainTransferEvent: InterchainTransferEvent = {
      tokenId: '0c38359b7a35c755573659d797afec315bb0e51374a056745abd9764715a15da',
      sourceAddress: Address.newFromBech32('erd1qqqqqqqqqqqqqpgqzqvm5ywqqf524efwrhr039tjs29w0qltkklsa05pk7'),
      dataHash: 'ebc84cbd75ba5516bf45e7024a9e12bc3c5c880f73e3a5beca7ebba52b2867a7',
      destinationChain: 'ethereum',
      destinationAddress: Buffer.from('destinationAddress'),
      amount: new BigNumber('1000000'),
    };

    it('Should handle', () => {
      itsContract.decodeInterchainTransferEvent.mockReturnValueOnce(
        interchainTransferEvent,
      );

      const transaction = createMock<TransactionOnNetwork>();
      transaction.hash = 'txHash';
      transaction.sender = Address.fromBech32('erd1qqqqqqqqqqqqqpgqzqvm5ywqqf524efwrhr039tjs29w0qltkklsa05pk7');

      const result = service.handleItsEvent(rawEvent, transaction, 1);

      expect(result).not.toBeUndefined();
      expect(result?.type).toBe('ITS/INTERCHAIN_TRANSFER');

      const event = result as ITSInterchainTransferEvent;

      expect(event.eventID).toBe('0xtxHash-1');
      expect(event.messageID).toBe('0xtxHash-0');
      expect(event.destinationChain).toBe(interchainTransferEvent.destinationChain);
      expect(event.tokenSpent).toEqual({
        tokenID: `0x${interchainTransferEvent.tokenId}`,
        amount: '1000000',
      });
      expect(event.sourceAddress).toBe('erd1qqqqqqqqqqqqqpgqzqvm5ywqqf524efwrhr039tjs29w0qltkklsa05pk7');
      expect(event.destinationAddress).toBe(BinaryUtils.hexToBase64(interchainTransferEvent.destinationAddress.toString('hex')));
      expect(event.dataHash).toBe(BinaryUtils.hexToBase64(interchainTransferEvent.dataHash));
      expect(event.meta).toEqual({
        txID: 'txHash',
        fromAddress: 'erd1qqqqqqqqqqqqqpgqzqvm5ywqqf524efwrhr039tjs29w0qltkklsa05pk7',
        finalized: true,
      });
    });
  });
});
