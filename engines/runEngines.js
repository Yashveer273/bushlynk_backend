const { getPickupPoints } = require("../services/loadpicups_in_redis");
const User = require("../models/students");
const { canSendAlert } = require("../utils/alertDeduplicator");
const getDistance = require("../utils/distance");
const { sendBatchNotification } = require("../services/fcmBatch.service");

// ✅ ADD (DO NOT REMOVE ANYTHING ELSE)
const {
  wasInsideZone,
  setInsideZone,
  clearZone,
} = require("../utils/geofenceState");

/*
=====================================================
MAIN ENGINE ORCHESTRATOR (PRODUCTION VERSION)
=====================================================
*/

async function runEngines(data) {
  try {

    const { schoolId, busNumber, lat, lng } = data;

    const pickupPoints = await getPickupPoints(schoolId, busNumber);

    for (const point of pickupPoints) {

      const distance = getDistance(
        lat,
        lng,
        point.location.lat,
        point.location.lng
      );

      const userIds = point.assignedStudents.map(s => s.userId);

      const users = await Promise.all(
        userIds.map(async (userId) => {
          const userData = await User.findOne({ userId });

          if (!userData?.fcmToken) return null;

          return {
            userId,
            fcmToken: userData.fcmToken,
          };
        })
      );

      const validUsers = users.filter(Boolean);
      const tokens = validUsers.map(u => u.fcmToken);

      /*
      =====================================
      🚍 ARRIVAL ALERT (FIXED - NO DUPLICATES)
      =====================================
      */
      if (distance <= point.radius) {

        const alreadyInside = await wasInsideZone(
          busNumber,
          point.pickupPointId
        );

        // ❌ prevent spam while bus stays inside
        if (alreadyInside) continue;

        const allowed = await canSendAlert(
          busNumber,
          point.pickupPointId,
          "ARRIVAL_ALERT"
        );

        if (!allowed) continue;

        await sendBatchNotification(tokens, {
          title: "Bus Arriving 🚍",
          body: `Bus is near ${point.name}`,
          type: "BUS_ARRIVING",
          busNumber,
        });

        // ✅ mark zone entry
        await setInsideZone(busNumber, point.pickupPointId);
      }

      /*
      =====================================
      🚪 BUS EXIT (RESET STATE)
      =====================================
      */
      if (distance > point.radius) {
        await clearZone(busNumber, point.pickupPointId);
      }

      /*
      =====================================
      ⚡ NEARBY ALERT (OPTIONAL CONTROLLED)
      =====================================
      */
      else if (distance <= point.radius * 3) {

        const alreadyInside = await wasInsideZone(
          busNumber,
          point.pickupPointId
        );

        if (alreadyInside) continue;

        const allowed = await canSendAlert(
          busNumber,
          point.pickupPointId,
          "NEARBY_ALERT"
        );

        if (!allowed) continue;

        await sendBatchNotification(tokens, {
          title: "Bus is Nearby ⚡",
          body: `Bus is approaching ${point.name}`,
          type: "BUS_NEARBY",
          busNumber,
        });
      }
    }

  } catch (err) {
    console.log("Engine Error:", err.message);
  }
}

module.exports = { runEngines };