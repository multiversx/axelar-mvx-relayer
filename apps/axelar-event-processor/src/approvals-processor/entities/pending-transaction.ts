export interface PendingTransaction {
  txHash: string;
  externalData: Uint8Array;
  retry: number;
}
