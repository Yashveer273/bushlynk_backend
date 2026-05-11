const {
  messaging,
} = require("../config/firebase");
const { pushToRetryQueue } = require("./fcmRetryQueue.service");
const { getFcmToken } = require("./fcmCache.service");

/*
====================================================
SEND ALERT - PRODUCTION SAFE VERSION
====================================================
*/

async function sendAlert(payload) {
  try {

    /*
    =====================================
    MULTIPLE USERS (BATCH SAFE)
    =====================================
    */

    if (payload.users?.length) {

      await Promise.all(
        payload.users.map(async (user) => {

          try {

            // 🔥 FAST TOKEN FETCH (Redis → Firebase fallback)
            const token = await getFcmToken(user.userId);

            if (!token) return;

            await messaging.send({
              token,

              notification: {
                title: payload.title,
                body: payload.body,
              },

              data: {
                type: payload.type,
                busNumber: String(payload.busNumber),
              },
            });

          } catch (err) {
            console.log(
              `FCM send failed for user ${user.userId}:`,
              err.message
            );
             await pushToRetryQueue({
    userId: user.userId,
    title: payload.title,
    body: payload.body,
    type: payload.type,
    busNumber: payload.busNumber,
    retryCount: 0,
  });
          }

        })
      );
    }

    /*
    =====================================
    SINGLE USER MODE
    =====================================
    */

    if (payload.userId) {

      const token = await getFcmToken(payload.userId);

      if (!token) return;

     try {
  await messaging.send({
    token,

    notification: {
      title: payload.title,
      body: payload.body,
    },

    data: {
      type: payload.type,
      busNumber: String(payload.busNumber),
    },
  });

} catch (err) {
  console.log("FCM send failed:", err.message);

  await pushToRetryQueue({
    userId: payload.userId,
    title: payload.title,
    body: payload.body,
    type: payload.type,
    busNumber: payload.busNumber,
    retryCount: 0,
  });
}
    }

  } catch (err) {
    console.log("Notification Error:", err.message);
  }
}

module.exports = { sendAlert };