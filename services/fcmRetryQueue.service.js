const redis = require("../config/redis");

async function pushToRetryQueue(payload) {
  await redis.lPush(
    "fcm:retry:queue",
    JSON.stringify({
      ...payload,
      createdAt: Date.now(),
    })
  );
}

module.exports = { pushToRetryQueue };