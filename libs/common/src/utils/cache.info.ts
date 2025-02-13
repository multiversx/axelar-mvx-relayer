import { Constants } from "@multiversx/sdk-nestjs-common";

export class CacheInfo {
  key: string = "";
  ttl: number = Constants.oneSecond() * 6;

  static PendingTransaction(hash: string): CacheInfo {
    return {
      key: `pendingTransaction:${hash}`,
      ttl: Constants.oneMinute() * 10,
    };
  }

  static WegldTokenId(): CacheInfo {
    return {
      key: `wegldTokenId`,
      ttl: Constants.oneWeek(),
    };
  }

  static CrossChainTransactions(): CacheInfo {
    return {
      key: `crossChainTransactions`,
      ttl: Constants.oneWeek(),
    };
  }
}
