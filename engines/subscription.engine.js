const { getSubscriptionPoints } =
require("../services/loadpicups_in_redis");

const getDistance =
require("../utils/distance");

const { sendAlert } =
require("../services/sendAlert");

const {
  normalizeLocation,
} = require("../utils/locationNormalizer");

const {
  canSendAlert,
} = require("../utils/alertDeduplicator");

const {
  wasInsideZone,
  setInsideZone,
  clearZone,
} = require("../utils/geofenceState");

/*
=====================================================
SUBSCRIPTION ENGINE
(PRODUCTION SAFE)
=====================================================

FEATURES:
- Multi child safe
- Multi bus safe
- No repeated alerts
- Separate nearby/arrival zones
- Parent-level isolation
- Redis scalable
=====================================================
*/

async function subscriptionEngine(data) {

  try {

    const {
      busNumber,
      lat,
      lng,
    } = data;

    const subs =
      await getSubscriptionPoints(
        busNumber
      );

    for (const sub of subs) {

      /*
      =====================================
      BASIC VALIDATION
      =====================================
      */

      if (!sub) continue;

      if (!sub.active) continue;

      if (!sub.alerts) continue;

      if (!sub.childId) continue;

      const loc =
        normalizeLocation(
          sub.location
        );

      if (!loc) continue;

      /*
      =====================================
      DISTANCE
      =====================================
      */

      const distance =
        getDistance(
          lat,
          lng,
          loc.lat,
          loc.lng
        );

      /*
      =====================================
      GEOFENCE KEYS
      =====================================
      */

      const arrivalZoneKey =
        `${sub.subscriptionId}_${sub.childId}_ARRIVAL`;

      const nearbyZoneKey =
        `${sub.subscriptionId}_${sub.childId}_NEARBY`;

      /*
      =====================================
      ARRIVAL ALERT
      =====================================
      */

      if (
        sub.alerts.arrivalAlert &&
        distance <= sub.radius
      ) {

        const alreadyInside =
          await wasInsideZone(
            busNumber,
            arrivalZoneKey
          );

        if (!alreadyInside) {

          const allowed =
            await canSendAlert(
              busNumber,
              arrivalZoneKey,
              "SUB_ARRIVAL"
            );

          if (allowed) {

            await sendAlert({

              type:
                "SUB_ARRIVAL",

              parentId:
                sub.parentId,

              childId:
                sub.childId,

              title:
                "Bus Arrived Near Stop 🚍",

              body:
                `${sub.childName}'s bus has arrived near pickup point`,

              busNumber,
            });

            await setInsideZone(
              busNumber,
              arrivalZoneKey
            );
          }
        }
      }

      /*
      =====================================
      NEARBY ALERT
      =====================================
      */

      else if (

        sub.alerts.nearbyAlert &&

        distance <= sub.radius * 3

      ) {

        const alreadyInside =
          await wasInsideZone(
            busNumber,
            nearbyZoneKey
          );

        if (!alreadyInside) {

          const allowed =
            await canSendAlert(
              busNumber,
              nearbyZoneKey,
              "SUB_NEARBY"
            );

          if (allowed) {

            await sendAlert({

              type:
                "SUB_NEARBY",

              parentId:
                sub.parentId,

              childId:
                sub.childId,

              title:
                "Bus is Approaching ⚡",

              body:
                `${sub.childName}'s bus is approaching pickup point`,

              busNumber,
            });

            await setInsideZone(
              busNumber,
              nearbyZoneKey
            );
          }
        }
      }

      /*
      =====================================
      FULL EXIT RESET
      =====================================
      */

      if (
        distance >
        sub.radius * 3
      ) {

        await clearZone(
          busNumber,
          arrivalZoneKey
        );

        await clearZone(
          busNumber,
          nearbyZoneKey
        );
      }
    }

  } catch (err) {

    console.log(
      "Subscription Engine Error:",
      err
    );
  }
}

module.exports = {
  subscriptionEngine,
};