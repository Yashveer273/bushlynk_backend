const redis = require("../config/redis");
const { db } = require("../config/firebase");
const { runEngines } = require("../engines/runEngines.js");

async function processLocation(data) {
  try {
    const { schoolId, busNumber,speed,timestamp , lat, lng } = data;


console.log("Processing Location:", data.speed);
    /*
    ================================
    SAVE LIVE GPS (REDIS)
    ================================
    */

    await redis.set(
      `bus:${busNumber}`,
      JSON.stringify({
        schoolId,
        busNumber,
        lat,
        lng,
        speed,
        timestamp,
        updatedAt: Date.now(),
      })
    );

    /*
    ================================
    FIREBASE LIVE LOCATION
    ================================
    */

    await db
      .ref(`liveLocations/${schoolId}/${busNumber}`)
      .set({
        lat,
        lng,
        speed,
        timestamp,
        updatedAt: Date.now(),
      });

    /*
    ================================
    RUN ALL ENGINES (CENTRALIZED)
    ================================
    */

    await runEngines(data);

  } catch (err) {
    console.log("Location Service Error:", err);
  }
}

module.exports = { processLocation };