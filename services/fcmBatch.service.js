const { messaging } = require("../config/firebase");

/*
=========================================
SEND BATCH NOTIFICATION (PRODUCTION SAFE)
=========================================
*/

async function sendBatchNotification(tokens = [], payload) {
  try {
    if (!tokens.length) return;

    /*
    Firebase supports multicast (up to 500 tokens per call)
    */

    const chunkSize = 500;

    for (let i = 0; i < tokens.length; i += chunkSize) {

      const chunk = tokens.slice(i, i + chunkSize);

      const message = {
        tokens: chunk,

        notification: {
          title: payload.title,
          body: payload.body,
        },

        data: {
          type: payload.type,
          busNumber: String(payload.busNumber),
        },
      };

      await messaging.sendEachForMulticast(message);
    }

  } catch (err) {
    console.log("Batch FCM Error:", err.message);
  }
}

module.exports = { sendBatchNotification };