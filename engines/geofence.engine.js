const { getNearbyStops } = require("../services/geoQuery.service");
const { sendAlert } = require("../services/notificationService");
const redisClient = require("../config/redis");
const { normalizeLocation } = require("../utils/locationNormalizer");
const getDistance = require("../utils/distance");

async function geofenceEngine(data) {
  try {
    const { schoolId, busNumber, lat, lng } = data;

    const stops = await getNearbyStops({
      schoolId,
      busNumber,
      lng,
      lat,
      maxDistance: 3000,
    });

    for (const stop of stops) {

      const stopLoc = normalizeLocation(stop.location);
      if (!stopLoc) continue;

      const distance = getDistance(lat, lng, stopLoc.lat, stopLoc.lng);

      const key = `bus_state:${busNumber}:${stop.pickupPointId}`;
      const current = await redisClient.get(key);

      let state = null;

      if (distance <= stop.radius && current !== "arrived") {
        state = "arrived";

        await sendAlert({
          type: "arrived_stop",
          users: stop.assignedStudents,
          title: "Bus Arrived",
          body: "Bus reached pickup point",
          busNumber,
        });
      }

      else if (distance <= 1000 && !current) {
        state = "near";

        await sendAlert({
          type: "near_stop",
          users: stop.assignedStudents,
          title: "Bus Near Stop",
          body: "Bus is 1 KM away",
          busNumber,
        });
      }

      else if (distance > stop.radius + 100 && current === "arrived") {
        state = "left";

        await sendAlert({
          type: "left_stop",
          users: stop.assignedStudents,
          title: "Bus Left Stop",
          body: "Bus departed",
          busNumber,
        });
      }

      if (state && state !== current) {
        await redisClient.set(key, state, { EX: 1800 });
      }
    }

  } catch (err) {
    console.log("Geofence Engine Error:", err);
  }
}

module.exports = { geofenceEngine };