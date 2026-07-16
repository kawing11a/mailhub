import Redis from 'ioredis';

const globalForRedis = globalThis as unknown as {
  redis: Redis | undefined;
};

export const redis =
  globalForRedis.redis ??
  new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
    maxRetriesPerRequest: null, // Required for BullMQ
    enableReadyCheck: false,
    retryStrategy(times) {
      console.warn(`Redis connection lost. Retrying (attempt ${times})...`);
      return Math.min(times * 100, 3000); // Reconnect after max 3 seconds
    }
  });

if (process.env.NODE_ENV !== 'production') globalForRedis.redis = redis;
