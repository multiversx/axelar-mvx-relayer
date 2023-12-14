import { Constants } from "@multiversx/sdk-nestjs-common";

export class CacheInfo {
  key: string = "";
  ttl: number = Constants.oneSecond() * 6;

  static ChainId(): CacheInfo {
    return {
      key: `chainId`,
      ttl: Constants.oneWeek(),
    };
  }

  static StartProcessHeight(): CacheInfo {
    return {
      key: `startProcessHeight`,
      ttl: Constants.oneWeek(),
    };
  }

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
}
