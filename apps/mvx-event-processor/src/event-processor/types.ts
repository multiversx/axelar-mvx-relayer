export interface NotifierBlockEvent {
  hash: string;
  shardId: number;
  timestamp: Number;
  events: NotifierEvent[];
}

export interface NotifierEvent {
  txHash: string;
  address: string;
  identifier: string;
  data: string;
  topics: string[];
  order: number; // TODO: This field doesn't seem to come from the notifier, and is quite needed currently...
}
