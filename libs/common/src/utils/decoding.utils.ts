import BigNumber from 'bignumber.js';
import { ITransactionEvent, ResultsParser } from '@multiversx/sdk-core/out';
import { EventDefinition } from '@multiversx/sdk-core/out/smartcontracts/typesystem/event';

export class DecodingUtils {
  private static readonly resultsParser: ResultsParser = new ResultsParser();

  static decodeByteArrayToHex(hash: BigNumber[]): string {
    return Buffer.from(hash.map((number: BigNumber) => number.toNumber())).toString('hex');
  }

  static parseTransactionEvent(event: ITransactionEvent, eventDefinition: EventDefinition) {
    return DecodingUtils.resultsParser.parseEvent(
      {
        topics: event.topics.map((topic) => Buffer.from(topic.hex(), 'hex')),
        dataPayload: event.dataPayload,
        additionalData: event.additionalData,
      },
      eventDefinition,
    );
  }

  static getEventId(txHash: string, index: number) {
    // The id needs to have `0x` in front of the txHash (hex string)
    return `0x${txHash}-${index}`;
  }
}
