const { processRetryQueue } = require("./fcmRetry.worker");

/*
====================================================
RUN RETRY WORKER EVERY 30 SECONDS
====================================================
*/

function startRetryWorker() {
  setInterval(() => {
    processRetryQueue();
  }, 30 * 1000); // 30 sec
}

module.exports = { startRetryWorker };