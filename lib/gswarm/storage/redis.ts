// lib/gswarm/storage/redis.ts
import Redis from "ioredis";

/**
 * Redis client singleton for GSwarm persistent storage
 * Uses standard Redis protocol (not vendor REST API) for maximum compatibility
 * Works with Upstash, Redis Cloud, self-hosted, or Docker redis:latest
 */

let redisClient: Redis | null = null;

/**
 * Get the Redis client singleton
 * Auto-connects on first call, reuses connection thereafter
 */
export function getRedisClient(): Redis {
  if (!redisClient) {
    const redisUrl = process.env.REDIS_URL;
    if (!redisUrl) {
      throw new Error(
        "REDIS_URL environment variable not set. Add to .env: rediss://default:password@host:port",
      );
    }

    redisClient = new Redis(redisUrl, {
      retryStrategy: (times) => {
        const delay = Math.min(times * 50, 2000);
        return delay;
      },
      maxRetriesPerRequest: 3,
    });

    redisClient.on("error", (err) => {
      console.error("[Redis] Error:", err.message);
    });

    redisClient.on("connect", () => {
      console.log("[Redis] Connected");
    });

    redisClient.on("ready", () => {
      console.log("[Redis] Ready");
    });

    redisClient.on("reconnecting", () => {
      console.log("[Redis] Reconnecting...");
    });
  }

  return redisClient;
}

/**
 * Health check - verifies Redis connection is alive
 * @returns true if Redis responds to PING, false otherwise
 */
export async function healthCheck(): Promise<boolean> {
  try {
    const client = getRedisClient();
    const result = await client.ping();
    return result === "PONG";
  } catch {
    return false;
  }
}

/**
 * Graceful shutdown handler
 * Call this when the application is terminating
 */
export async function shutdown(): Promise<void> {
  if (redisClient) {
    await redisClient.quit();
    redisClient = null;
  }
}

// Register process shutdown handlers
process.on("SIGTERM", () => {
  shutdown().catch((err) => console.error("[Redis] Shutdown error:", err));
});
process.on("SIGINT", () => {
  shutdown().catch((err) => console.error("[Redis] Shutdown error:", err));
});

// Export singleton instance getter as default
export default getRedisClient;
