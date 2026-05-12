const redis = require("../config/redis");

const {
  sendAlert,
} = require("../services/notificationService");

/*
====================================================
FCM RETRY WORKER
====================================================
*/

async function processRetryQueue() {

  try {

    const jobData =
      await redis.rPop(
        "fcm:retry:queue"
      );

    if (!jobData) return;

    const job =
      JSON.parse(jobData);

    /*
    Max retry limit
    */

    if (job.retryCount >= 3) {

      console.log(
        "❌ Dropped FCM after max retries:",
        job
      );

      return;
    }

    /*
    Retry send
    */

    await sendAlert({

      parentId:
        job.parentId,

      title:
        job.title,

      body:
        job.body,

      type:
        job.type,

      busNumber:
        job.busNumber,
    });

    /*
    Increment retry count
    */

    job.retryCount += 1;

  } catch (err) {

    console.log(
      "Retry Worker Error:",
      err.message
    );
  }
}

module.exports = {
  processRetryQueue,
};