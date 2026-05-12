const redis =
  require("../config/redis");

const {
  getNearbyStops,
} = require("../services/geoQuery.service");

const {
  normalizeLocation,
} = require("../utils/locationNormalizer");

const getDistance =
  require("../utils/distance");

/*
==================================================
NEARBY ENGINE
==================================================

PURPOSE:
- Detect nearby pickup point
- Cache nearest stop
- Support geofence engines
- Support realtime UI
- Redis optimized

RADIUS:
Default = 150 meters
==================================================
*/

async function nearbyEngine(
  data
) {

  try {

    const {
      schoolId,
      busNumber,
      lat,
      lng,
    } = data;

    /*
    ==========================================
    GET NEARBY STOPS
    ==========================================
    */

    const stops =
      await getNearbyStops({

        schoolId,

        busNumber,

        lng,

        lat,

        maxDistance: 5000,
      });

    let nearestStop = null;

    let minDistance = Infinity;

    /*
    ==========================================
    FIND CLOSEST STOP
    ==========================================
    */

    for (const stop of stops) {

      const stopLoc =
        normalizeLocation(
          stop.location
        );

      if (!stopLoc) continue;

      /*
      distance in meters
      */

      const distance =
        getDistance(
          lat,
          lng,
          stopLoc.lat,
          stopLoc.lng
        );

      const radius =
        stop.radius || 150;

      /*
      closest stop inside radius
      */

      if (
        distance <= radius &&
        distance < minDistance
      ) {

        minDistance =
          distance;

        nearestStop = {

          pickupPointId:
            stop.pickupPointId,

          name:
            stop.name,

          radius,

          distanceMeters:
            distance,

          insideRadius:
            true,
        };
      }
    }

    /*
    ==========================================
    STORE IN REDIS
    ==========================================
    */

    const key =
      `nearby:${busNumber}`;

    await redis.set(

      key,

      JSON.stringify({

        busNumber,

        lat,

        lng,

        nearestStop,

        updatedAt:
          Date.now(),
      }),

      {
        EX: 120,
      }
    );

    console.log(
      `✅ Nearby cache updated: ${busNumber}`
    );

  } catch (err) {

    console.log(
      "Nearby Engine Error:",
      err
    );
  }
}

module.exports = {
  nearbyEngine,
};