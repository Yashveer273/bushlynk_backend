const redis = require("../config/redis");
const { sendAlert } = require("../services/notificationService");

/*
====================================================
FCM RETRY WORKER (CRON OR BACKGROUND PROCESS)
====================================================
*/

async function processRetryQueue() {
  try {

    // Get 1 failed job at a time (safe for scale)
    const jobData = await redis.rPop("fcm:retry:queue");

    if (!jobData) return;

    const job = JSON.parse(jobData);

    // ❌ stop after 3 retries
    if (job.retryCount >= 3) {
      console.log("❌ Dropped FCM after max retries:", job);
      return;
    }

    // retry again using your existing system
    await sendAlert({
      userId: job.userId,
      title: job.title,
      body: job.body,
      type: job.type,
      busNumber: job.busNumber,
    });

  } catch (err) {
    console.log("Retry Worker Error:", err.message);
  }
}

module.exports = { processRetryQueue };