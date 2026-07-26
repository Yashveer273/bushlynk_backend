
const { db } = require("../config/firebase");
const { runEngines } = require("../engines/runEngines.js");
const redis = require("../config/redis");


async function processLocation(data) {
  try {
    const {
      schoolId,
      busNumber,
      speed,
      timestamp,
      lat,
      lng,
    } = data;

    if (
      !schoolId ||
      !busNumber ||
      lat == null ||
      lng == null
    ) {
      console.error(
        "Invalid location data:",
        data,
      );

      return;
    }

    const updatedAt = Date.now();

    const locationData = {
      schoolId,
      busNumber,
      lat: Number(lat),
      lng: Number(lng),
      speed: Number(speed) || 0,
      timestamp:
        timestamp || updatedAt,
      updatedAt,
    };

    /*
    Redis key includes schoolId.

    This prevents collision if two schools
    have the same bus number.
    */

    const redisKey =
      `school:${schoolId}:` +
      `bus:${busNumber}:liveLocation`;

    /*
    Firebase location stays under the bus.

    Direct path:
    schools/{schoolId}/buses/{busNumber}/liveLocation
    */

    const firebaseLocationPath =
      `schools/${schoolId}/` +
      `buses/${busNumber}/liveLocation`;

    /*
    Save Redis and Firebase together.
    */

    await Promise.all([
      redis.set(
        redisKey,
        JSON.stringify(locationData),
      ),

      db.ref(firebaseLocationPath).set(
        locationData,
      ),
    ]);

    /*
    Run geofence, ETA and notification engines.
    */

    await runEngines(data);
  } catch (error) {
    console.error(
      "Location Service Error:",
      error,
    );
  }
}

module.exports.processLocation =
  processLocation;