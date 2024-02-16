export interface PendingTransaction {
  txHash: string;
  executeData: Uint8Array;
  retry: number;
}
