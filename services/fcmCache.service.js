const redis =
require("../config/redis");

const { db } =
require("../config/firebase");

/*
====================================================
FCM CACHE SERVICE
====================================================

FLOW:
Redis → Firebase → Redis Cache

====================================================
*/

async function getFcmToken(parentId) {

  try {

    if (!parentId) {
      return null;
    }

    const cacheKey =
      `fcm:${parentId}`;

    /*
    ====================================
    REDIS CACHE
    ====================================
    */

    const cached =
      await redis.get(cacheKey);

    if (cached) {
      return cached;
    }

    /*
    ====================================
    FIREBASE FALLBACK
    ====================================
    */

    const snapshot =
      await db
        .ref(`users/${parentId}`)
        .once("value");

    const token =
      snapshot.val()?.fcmToken;

    if (!token) {
      return null;
    }

    /*
    ====================================
    CACHE TOKEN
    ====================================
    */

    await redis.set(
      cacheKey,
      token,
      {
        EX:
          60 * 60 * 6,
      }
    );

    return token;

  } catch (err) {

    console.log(
      "FCM Cache Error:",
      err.message
    );

    return null;
  }
}

module.exports = {
  getFcmToken,
};