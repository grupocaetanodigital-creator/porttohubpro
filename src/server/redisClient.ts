import { createUpstashCache, type UpstashCacheStats } from './upstashClient.ts';

export type CacheStats = UpstashCacheStats;

export const redisCache = createUpstashCache(typeof process !== 'undefined' ? (process.env as any) : {});
