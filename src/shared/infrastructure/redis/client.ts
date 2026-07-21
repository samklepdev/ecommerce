import Redis from 'ioredis';

import { env } from '@/config/env';

const globalForRedis = globalThis as unknown as { __redis?: Redis };

// `lazyConnect` defers the actual TCP connection until the first command
// instead of connecting the moment this module is imported — importing the
// DI container (and therefore this client) must not require a live Redis,
// e.g. during `next build`'s static generation of pages that never issue a
// Redis command.
export const redis = globalForRedis.__redis ?? new Redis(env.REDIS_URL, { lazyConnect: true });
if (process.env.NODE_ENV !== 'production') globalForRedis.__redis = redis;
