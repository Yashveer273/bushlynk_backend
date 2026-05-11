const redis = require("../config/redis");

/*
========================================
CHECK IF BUS WAS ALREADY INSIDE ZONE
========================================
*/
async function wasInsideZone(busNumber, pointId) {
  const key = `zone:state:${busNumber}:${pointId}`;
  return await redis.get(key);
}

/*
========================================
MARK BUS AS INSIDE ZONE
========================================
*/
async function setInsideZone(busNumber, pointId) {
  const key = `zone:state:${busNumber}:${pointId}`;

  // TTL ensures auto cleanup if system crashes
  await redis.set(key, "1", { EX: 300 }); // 5 minutes
}

/*
========================================
REMOVE ZONE STATE (BUS LEFT)
========================================
*/
async function clearZone(busNumber, pointId) {
  const key = `zone:state:${busNumber}:${pointId}`;
  await redis.del(key);
}

module.exports = {
  wasInsideZone,
  setInsideZone,
  clearZone,
};