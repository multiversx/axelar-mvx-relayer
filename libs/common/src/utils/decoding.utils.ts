import BigNumber from 'bignumber.js';

export class DecodingUtils {
  static decodeKeccak256Hash(hash: BigNumber[]): string {
    return Buffer.from(hash.map((number: BigNumber) => number.toNumber())).toString('hex');
  }
}
