const redis = require("redis");

/*
  Create Redis client
*/
const redisClient = redis.createClient({
  socket: {
    host: "127.0.0.1",
    port: 6379,
  },
});

/*
  Redis error handling
*/
redisClient.on("error", (err) => {
  console.log("Redis Error:", err);
});

/*
  Connect Redis
*/
(async () => {
  try {

    await redisClient.connect();

    console.log("✅ Redis Connected");

  } catch (err) {

    console.log(
      "❌ Redis Connection Failed:",
      err
    );
  }
})();

module.exports = redisClient;