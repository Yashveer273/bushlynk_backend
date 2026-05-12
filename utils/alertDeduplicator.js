const redis = require("../config/redis");

/*
=====================================================
PREVENT DUPLICATE ALERTS
=====================================================

Supports:
- Multi-child
- Multi-bus
- Multi-pickup
- Parent-level deduplication
*/

async function canSendAlert(entityKey, pointKey, type) {

  const key =
    `alert_lock:${entityKey}:${pointKey}:${type}`;

  const exists = await redis.get(key);

  if (exists) {
    return false;
  }

  /*
  Lock alert for 2 mins
  */

  await redis.set(
    key,
    "1",
    { EX: 120 }
  );

  return true;
}

module.exports = {
  canSendAlert,
};