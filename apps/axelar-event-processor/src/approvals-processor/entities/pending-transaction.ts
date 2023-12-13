export interface PendingTransaction {
  executeData: Uint8Array;
  retry: number;
}
