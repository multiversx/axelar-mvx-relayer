import BigNumber from 'bignumber.js';

export interface TransferData {
  newOperators: string[];
  newWeights: BigNumber[];
  newThreshold: BigNumber;
}
