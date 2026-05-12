const { messaging } =
require("../config/firebase");

const {
  pushToRetryQueue,
} = require("./fcmRetryQueue.service");

/*
==================================================
SEND BATCH NOTIFICATION
(PRODUCTION SAFE)
==================================================

FEATURES:
- multicast batching
- retry-safe
- invalid token cleanup ready
- scalable
==================================================
*/

async function sendBatchNotification(
  tokens = [],
  payload = {}
) {

  try {

    if (
      !Array.isArray(tokens) ||
      !tokens.length
    ) {
      return;
    }

    /*
    REMOVE EMPTY TOKENS
    */

    const validTokens = [

      ...new Set(

        tokens.filter(Boolean)
      ),
    ];

    if (!validTokens.length) {
      return;
    }

    /*
    FIREBASE LIMIT:
    500 TOKENS MAX
    */

    const chunkSize = 500;

    for (
      let i = 0;
      i < validTokens.length;
      i += chunkSize
    ) {

      const chunk =
        validTokens.slice(
          i,
          i + chunkSize
        );

      const message = {

        tokens: chunk,

        notification: {

          title:
            payload.title || "",

          body:
            payload.body || "",
        },

        data: {

          type:
            String(payload.type || ""),

          busNumber:
            String(payload.busNumber || ""),

          pickupPointId:
            String(
              payload.pickupPointId || ""
            ),
        },
      };

      const response =
        await messaging.sendEachForMulticast(
          message
        );

      /*
      HANDLE FAILURES
      */

      if (
        response.failureCount > 0
      ) {

        response.responses.forEach(
          async (resp, idx) => {

            if (!resp.success) {

              const failedToken =
                chunk[idx];

              console.log(
                "FCM Batch Error:",
                resp.error?.message
              );

              await pushToRetryQueue({

                token:
                  failedToken,

                title:
                  payload.title,

                body:
                  payload.body,

                type:
                  payload.type,

                busNumber:
                  payload.busNumber,

                retryCount: 0,
              });
            }
          }
        );
      }
    }

  } catch (err) {

    console.log(
      "Batch FCM Error:",
      err.message
    );
  }
}

module.exports = {
  sendBatchNotification,
};