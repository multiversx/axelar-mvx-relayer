export interface PendingTransaction {
  txHash: string;
  externalData: string; // hex string in format 0x...
  retry: number;
}
