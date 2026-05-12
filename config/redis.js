const redis = require("redis");

/*
====================================================
REDIS CLIENT (SAFE + AUTO RECOVERY)
====================================================
*/

const redisClient = redis.createClient({
  socket: {
    host: "127.0.0.1",
    port: 6379,

    /*
    ============================================
    RECONNECT STRATEGY (IMPORTANT FIX)
    ============================================
    */

    reconnectStrategy: (retries) => {
      /*
        Exponential backoff with cap
        - prevents CPU spike loops
        - stabilizes reconnect storms
      */

      const delay = Math.min(retries * 200, 3000);

      console.log(
        `🔄 Redis reconnect attempt #${retries} (retry in ${delay}ms)`
      );

      return delay;
    },
  },
});

/*
====================================================
EVENT HANDLERS
====================================================
*/

redisClient.on("connect", () => {
  console.log("🔌 Redis connecting...");
});

redisClient.on("ready", () => {
  console.log("✅ Redis ready");
});

redisClient.on("reconnecting", () => {
  console.log("♻️ Redis reconnecting...");
});

redisClient.on("end", () => {
  console.log("⚠️ Redis connection closed");
});

redisClient.on("error", (err) => {
  console.log("❌ Redis Error:", err.message);
});

/*
====================================================
SAFE CONNECT
====================================================
*/

async function connectRedis() {
  try {
    if (!redisClient.isOpen) {
      await redisClient.connect();
    }
  } catch (err) {
    console.log("❌ Redis initial connection failed:", err.message);
  }
}

connectRedis();

/*
====================================================
GRACEFUL PROCESS HANDLING (IMPORTANT SAFETY LAYER)
====================================================
*/

process.on("SIGINT", async () => {
  try {
    await redisClient.quit();
    console.log("🛑 Redis disconnected gracefully");
    process.exit(0);
  } catch (err) {
    process.exit(1);
  }
});

process.on("SIGTERM", async () => {
  try {
    await redisClient.quit();
    console.log("🛑 Redis terminated gracefully");
    process.exit(0);
  } catch (err) {
    process.exit(1);
  }
});

module.exports = redisClient;