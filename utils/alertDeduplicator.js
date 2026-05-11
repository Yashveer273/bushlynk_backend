const redis = require("../config/redis");

/*
=====================================================
PREVENT DUPLICATE ALERTS
=====================================================

Key idea:
- One bus + one stop + one alert type
- Only allow once per X seconds
*/

async function canSendAlert(busNumber, pickupPointId, type) {
  const key = `alert_lock:${busNumber}:${pickupPointId}:${type}`;

  const exists = await redis.get(key);

  if (exists) {
    return false; // already sent recently
  }

  // lock for 2 minutes (adjust as needed)
  await redis.set(key, "1", "EX", 120);

  return true;
}

module.exports = { canSendAlert };