const redis =
require("../config/redis");

/*
====================================================
FCM RETRY QUEUE
====================================================
*/

async function pushToRetryQueue(
  payload
) {

  try {

    if (!payload) return;

    await redis.lPush(

      "fcm:retry:queue",

      JSON.stringify({

        ...payload,

        retryCount:
          payload.retryCount || 0,

        createdAt:
          Date.now(),
      })
    );

  } catch (err) {

    console.log(
      "Retry Queue Error:",
      err.message
    );
  }
}

module.exports = {
  pushToRetryQueue,
};