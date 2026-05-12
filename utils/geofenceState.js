const redis = require("../config/redis");

/*
========================================
CHECK IF BUS WAS ALREADY INSIDE ZONE
========================================
*/

async function wasInsideZone(busNumber, pointId) {

  const key =
    `zone:state:${busNumber}:${pointId}`;

  const exists =
    await redis.get(key);

  return !!exists;
}

/*
========================================
MARK BUS AS INSIDE ZONE
========================================
*/

async function setInsideZone(busNumber, pointId) {

  const key =
    `zone:state:${busNumber}:${pointId}`;

  await redis.set(
    key,
    "1",
    { EX: 300 }
  );
}

/*
========================================
REMOVE ZONE STATE
========================================
*/

async function clearZone(busNumber, pointId) {

  const key =
    `zone:state:${busNumber}:${pointId}`;

  await redis.del(key);
}

module.exports = {
  wasInsideZone,
  setInsideZone,
  clearZone,
};