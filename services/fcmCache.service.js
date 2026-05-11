const redis = require("../config/redis");
const { db } = require("../config/firebase");

/*
====================================================
GET FCM TOKEN (CACHE FIRST STRATEGY)
====================================================
*/

async function getFcmToken(userId) {
  try {
    const cacheKey = `fcm:${userId}`;

    // 1. Check Redis cache
    const cached = await redis.get(cacheKey);
    if (cached) return cached;

    // 2. Fallback to Firebase DB
    const snapshot = await db.ref(`users/${userId}`).once("value");
    const token = snapshot.val()?.fcmToken;

    if (!token) return null;

    // 3. Store in Redis (TTL 6 hours)
    await redis.set(cacheKey, token, {
      EX: 60 * 60 * 6,
    });

    return token;

  } catch (err) {
    console.log("FCM Cache Error:", err.message);
    return null;
  }
}

module.exports = { getFcmToken };