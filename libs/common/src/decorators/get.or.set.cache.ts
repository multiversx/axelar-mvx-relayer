import { Inject } from '@nestjs/common';
import { CacheService } from '@multiversx/sdk-nestjs-cache';
import { CacheInfo } from '@mvx-monorepo/common';

export function GetOrSetCache(cacheInfoFunc: (...args: any[]) => CacheInfo) {
  const injectCacheService = Inject(CacheService);

  return (
    target: any,
    _key: string | symbol,
    descriptor: PropertyDescriptor,
  ) => {
    injectCacheService(target, 'cacheService');

    const childMethod = descriptor.value;

    descriptor.value = async function (...args: any[]) {
      const { key, ttl } = cacheInfoFunc(...args);

      const cachingService: CacheService = (this as any).cacheService;

      console.log('Caching service', cachingService);

      const funcValue = () => childMethod.apply(this, args);
      return await cachingService.getOrSet(key, funcValue, ttl);
    };

    return descriptor;
  };
}
