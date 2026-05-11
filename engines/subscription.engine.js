const { getSubscriptionPoints } = require("../services/loadpicups_in_redis");
const getDistance = require("../utils/distance");
const { sendAlert } = require("../services/sendAlert");
const { normalizeLocation } = require("../utils/locationNormalizer");
const { canSendAlert } = require("../utils/alertDeduplicator");

// ✅ ADD THIS (IMPORTANT)
const {
  wasInsideZone,
  setInsideZone,
  clearZone,
} = require("../utils/geofenceState");

/*
=====================================================
SUBSCRIPTION ENGINE (CLEAN + PROTECTED)
=====================================================
Triggers:
- NEARBY ALERT (3x radius)
- ARRIVAL ALERT (inside radius)
=====================================================
*/

async function subscriptionEngine(data) {
  try {
    const { busNumber, lat, lng } = data;

    const subs = await getSubscriptionPoints(busNumber);

    for (const sub of subs) {

      /*
      ======================================
      1. BASIC VALIDATION
      ======================================
      */
      if (!sub || !sub.active) continue;
      if (!sub.alerts) continue;

      const loc = normalizeLocation(sub.location);
      if (!loc) continue;

      const distance = getDistance(lat, lng, loc.lat, loc.lng);

      const zoneKey = sub.subscriptionId;

      /*
      ======================================
      2. ARRIVAL ALERT (FIXED - NO REPEAT)
      ======================================
      */
      if (
        sub.alerts.arrivalAlert &&
        distance <= sub.radius
      ) {

        const alreadyInside = await wasInsideZone(
          busNumber,
          zoneKey
        );

        // ❌ prevent repeat alerts
        if (alreadyInside) continue;

        const allowed = await canSendAlert(
          busNumber,
          sub.subscriptionId,
          "SUB_ARRIVAL"
        );

        if (!allowed) continue;

        await sendAlert({
          type: "SUB_ARRIVAL",
          userId: sub.userId,
          title: "Bus Arrived Near Your Stop",
          body: "Your bus has reached your pickup area",
          busNumber,
        });

        // ✅ mark state
        await setInsideZone(busNumber, zoneKey);

        continue;
      }

      /*
      ======================================
      3. BUS EXIT RESET
      ======================================
      */
      if (distance > sub.radius) {
        await clearZone(busNumber, zoneKey);
      }

      /*
      ======================================
      4. NEARBY ALERT (CONTROLLED)
      ======================================
      */
      if (
        sub.alerts.nearbyAlert &&
        distance <= sub.radius * 3
      ) {

        const alreadyInside = await wasInsideZone(
          busNumber,
          zoneKey
        );

        // ❌ prevent spam while inside zone
        if (alreadyInside) continue;

        const allowed = await canSendAlert(
          busNumber,
          sub.subscriptionId,
          "SUB_NEARBY"
        );

        if (!allowed) continue;

        await sendAlert({
          type: "SUB_NEARBY",
          userId: sub.userId,
          title: "Bus is Approaching",
          body: "Your bus is nearby your location",
          busNumber,
        });
      }
    }

  } catch (err) {
    console.log("Subscription Engine Error:", err);
  }
}

module.exports = { subscriptionEngine };