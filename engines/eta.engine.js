const redis = require("../config/redis");
const { normalizeLocation } = require("../utils/locationNormalizer");
const { getNearbyStops } = require("../services/geoQuery.service");
const getDistance = require("../utils/distance");
const admin = require("../config/firebase"); // ✅ ADD THIS

async function etaEngine(data) {
  try {
    const { schoolId, busNumber, lat, lng } = data;

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

    for (const stop of stops) {
      const stopLoc = normalizeLocation(stop.location);
      if (!stopLoc) continue;

      const distanceKm =
        getDistance(lat, lng, stopLoc.lat, stopLoc.lng) / 1000;

      const speedKmph = 25;

      const eta = Math.ceil((distanceKm / speedKmph) * 60);

      if (distanceKm < minDistance) {
        minDistance = distanceKm;
        etaMinutes = eta;

        nextStop = {
          pickupPointId: stop.pickupPointId,
          name: stop.name,
          distance: distanceKm,
        };
      }
    }

    // -----------------------------
    // 1. STORE IN REDIS (cache)
    // -----------------------------
    if (nextStop) {
      const key = `eta:${busNumber}:${nextStop.pickupPointId}`;

      await redis.set(
        key,
        JSON.stringify({
          stopId: nextStop.pickupPointId,
          etaMinutes,
          updatedAt: Date.now(),
        }),
        { EX: 120 }
      );
    }

    // -----------------------------
    // 2. STORE IN FIREBASE (IMPORTANT)
    // -----------------------------
    if (nextStop) {
      await admin.database()
        .ref(`/buses/${busNumber}/state`)
        .set({
          nextStop,
          etaMinutes,
          distance: minDistance,
          updatedAt: Date.now(),
        });
    }

  } catch (err) {
    console.log("ETA Engine Error:", err);
  }
}

module.exports = { etaEngine };