const redis = require("../config/redis");
const { normalizeLocation } = require("../utils/locationNormalizer");
const { getNearbyStops } = require("../services/geoQuery.service");
const getDistance = require("../utils/distance");
const admin = require("../config/firebase");

/*
==================================================
ETA ENGINE
==================================================

PURPOSE:
- Detect nearest pickup point
- Detect if bus entered pickup radius
- Store ETA in Redis
- Sync realtime state to Firebase

IMPORTANT:
- Radius is in METERS
- Notification engines use same radius
- Supports geofence logic

EXAMPLE:
radius = 150

Bus inside:
0m - 150m

=> considered ARRIVED / INSIDE ZONE
==================================================
*/

async function etaEngine(data) {

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

    const stops = await getNearbyStops({

      schoolId,

      busNumber,

      lng,

      lat,

      maxDistance: 5000,
    });

    let nextStop = null;

    let minDistance = Infinity;

    let etaMinutes = null;

    /*
    ==========================================
    FIND CLOSEST STOP INSIDE RADIUS
    ==========================================
    */

    for (const stop of stops) {

      const stopLoc =
        normalizeLocation(stop.location);

      if (!stopLoc) continue;

      /*
      ==========================================
      DISTANCE IN METERS
      ==========================================
      */

      const distanceMeters =
        getDistance(
          lat,
          lng,
          stopLoc.lat,
          stopLoc.lng
        );

      /*
      ==========================================
      USE DEFAULT RADIUS
      ==========================================
      */

      const radius =
        stop.radius || 150;

      /*
      ==========================================
      ETA CALCULATION
      ==========================================
      */

      const distanceKm =
        distanceMeters / 1000;

      const speedKmph = 25;

      const eta =
        Math.ceil(
          (distanceKm / speedKmph) * 60
        );

      /*
      ==========================================
      CHECK INSIDE GEOFENCE RADIUS
      ==========================================

      EXAMPLE:
      radius = 150m

      IF:
      distance <= 150m

      => bus considered arrived
      */

      if (
        distanceMeters <= radius &&
        distanceMeters < minDistance
      ) {

        minDistance =
          distanceMeters;

        etaMinutes =
          eta;

        nextStop = {

          pickupPointId:
            stop.pickupPointId,

          name:
            stop.name,

          distanceMeters,

          radius,
        };
      }
    }

    /*
    ==========================================
    STORE ETA IN REDIS
    ==========================================
    */

    if (nextStop) {

      const key =
        `eta:${busNumber}:${nextStop.pickupPointId}`;

      await redis.set(

        key,

        JSON.stringify({

          stopId:
            nextStop.pickupPointId,

          stopName:
            nextStop.name,

          etaMinutes,

          distanceMeters:
            minDistance,

          radius:
            nextStop.radius,

          insideRadius:
            true,

          updatedAt:
            Date.now(),
        }),

        {
          EX: 120,
        }
      );

      console.log(
        `✅ ETA Cached: ${key}`
      );
    }

    /*
    ==========================================
    STORE REALTIME STATE IN FIREBASE
    ==========================================
    */

    if (nextStop) {

      await admin
        .database()

        .ref(
          `/buses/${busNumber}/state`
        )

        .set({

          busNumber,

          nextStop: {

            pickupPointId:
              nextStop.pickupPointId,

            name:
              nextStop.name,
          },

          etaMinutes,

          distanceMeters:
            minDistance,

          radius:
            nextStop.radius,

          insideRadius:
            true,

          updatedAt:
            Date.now(),
        });

      console.log(
        `🔥 Firebase ETA updated for ${busNumber}`
      );
    }

  } catch (err) {

    console.log(
      "ETA Engine Error:",
      err
    );
  }
}

module.exports = {
  etaEngine,
};