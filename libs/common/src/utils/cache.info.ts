import { Constants } from "@multiversx/sdk-nestjs-common";

export class CacheInfo {
  key: string = "";
  ttl: number = Constants.oneSecond() * 6;

  static LastProcessedNonce(shardId: number): CacheInfo {
    return {
      key: `lastProcessedNonce:${shardId}`,
      ttl: Constants.oneMonth(),
    };
  }

  static ChainId(): CacheInfo {
    return {
      key: `chainId`,
      ttl: Constants.oneWeek(),
    };
  }

  static WegldTokenId(): CacheInfo {
    return {
      key: `wegldTokenId`,
      ttl: Constants.oneWeek(),
    };
  }
}
