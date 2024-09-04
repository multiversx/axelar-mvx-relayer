export interface PendingTransaction {
  txHash: string;
  externalData: string; // hex string
  retry: number;
}
