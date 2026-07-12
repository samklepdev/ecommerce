import Redis from 'ioredis';

import { env } from '@/config/env';

const globalForRedis = globalThis as unknown as { __redis?: Redis };

export const redis = globalForRedis.__redis ?? new Redis(env.REDIS_URL);
if (process.env.NODE_ENV !== 'production') globalForRedis.__redis = redis;
