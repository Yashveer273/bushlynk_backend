const { getPickupPoints } = require("../services/loadpicups_in_redis");

const User = require("../models/Students");

const {
  canSendAlert,
} = require("../utils/alertDeduplicator");

const getDistance =
  require("../utils/distance");

const {
  sendBatchNotification,
} = require("../services/fcmBatch.service");

const {
  wasInsideZone,
  setInsideZone,
  clearZone,
} = require("../utils/geofenceState");

/*
=====================================================
MAIN ENGINE ORCHESTRATOR
(PRODUCTION READY)
=====================================================

FEATURES:
-----------------------------------------
1. Multi-child support
2. Multi-bus support
3. Parent-level notification grouping
4. No duplicate parent alerts
5. Per-parent geofence state
6. One-time alerts
7. Re-entry alerts supported
8. Nearby + arrival separation
9. Kafka scalable
10. Redis optimized

RADIUS FLOW:
-----------------------------------------
0m - 150m
=> ARRIVAL ALERT

151m - 450m
=> NEARBY ALERT

>450m
=> clear zone
=====================================================
*/

async function runEngines(data) {

  try {

    const {
      schoolId,
      busNumber,
      lat,
      lng,
    } = data;

    /*
    =====================================
    LOAD PICKUP POINTS
    =====================================
    */

    const pickupPoints =
      await getPickupPoints(
        schoolId,
        busNumber
      );

    /*
    =====================================
    LOOP ALL PICKUP POINTS
    =====================================
    */

    for (const point of pickupPoints) {

      /*
      =====================================
      VALIDATE LOCATION
      =====================================
      */

      if (
        !point.location ||
        point.location.lat == null ||
        point.location.lng == null
      ) {
        continue;
      }

      /*
      =====================================
      DEFAULT RADIUS
      =====================================
      */

      const radius =
        point.radius || 150;

      /*
      =====================================
      CALCULATE DISTANCE (METERS)
      =====================================
      */

      const distance =
        getDistance(
          lat,
          lng,
          point.location.lat,
          point.location.lng
        );

      /*
      =====================================
      REMOVE DUPLICATE PARENTS
      =====================================
      */

      const parentIds = [

        ...new Set(

          point.assignedStudents.map(
            (student) =>
              student.parentId
          )
        ),
      ];

      /*
      =====================================
      LOAD USERS
      =====================================
      */

      const users =
        await Promise.all(

          parentIds.map(
            async (parentId) => {

              const userData =
                await User.findOne({
                  parentId,
                });

              /*
              ============================
              INVALID USER
              ============================
              */

              if (
                !userData ||
                !userData.fcmToken
              ) {
                return null;
              }

              /*
              ============================
              MATCH CHILDREN
              ============================
              */

              const matchingChildren =

                userData.children.filter(

                  (child) =>

                    child.busNumber ===
                    busNumber &&

                    child.pickupPointId ===
                    point.pickupPointId
                );

              /*
              ============================
              NO MATCHING CHILD
              ============================
              */

              if (
                matchingChildren.length === 0
              ) {
                return null;
              }

              return {

                parentId,

                fcmToken:
                  userData.fcmToken,

                children:
                  matchingChildren,
              };
            }
          )
        );

      /*
      =====================================
      FILTER VALID USERS
      =====================================
      */

      const validUsers =
        users.filter(Boolean);

      /*
      =====================================
      🚍 ARRIVAL ALERT
      =====================================

      INSIDE RADIUS:
      0m - 150m
      */

      if (
        distance <= radius
      ) {

        const notifications = [];

        for (const user of validUsers) {

          /*
          =================================
          CHECK GEOFENCE STATE
          =================================
          */

          const alreadyInside =

            await wasInsideZone(

              busNumber,

              point.pickupPointId,

              user.parentId
            );

          /*
          =================================
          PREVENT REPEAT ALERTS
          =================================
          */

          if (alreadyInside) {
            continue;
          }

          /*
          =================================
          DEDUPLICATION
          =================================
          */

          const allowed =
            await canSendAlert(

              `${user.parentId}_${busNumber}`,

              point.pickupPointId,

              "ARRIVAL_ALERT"
            );

          if (!allowed) {
            continue;
          }

          /*
          =================================
          CHILD NAMES
          =================================
          */

          const childNames =

            user.children
              .map(
                (child) =>
                  child.name
              )
              .join(", ");

          /*
          =================================
          PUSH NOTIFICATION
          =================================
          */

          notifications.push(

            sendBatchNotification(

              [user.fcmToken],

              {

                title:
                  "Bus Arriving 🚍",

                body:
                  `${childNames}'s bus is near ${point.name}`,

                type:
                  "BUS_ARRIVING",

                busNumber,

                pickupPointId:
                  point.pickupPointId,
              }
            )
          );

          /*
          =================================
          MARK INSIDE ZONE
          =================================
          */

          await setInsideZone(

            busNumber,

            point.pickupPointId,

            user.parentId
          );
        }

        /*
        =====================================
        SEND ALL NOTIFICATIONS
        =====================================
        */

        await Promise.all(
          notifications
        );
      }

      /*
      =====================================
      🚪 BUS EXIT RESET
      =====================================
      */

      if (
        distance > radius * 3
      ) {

        for (const user of validUsers) {

          await clearZone(

            busNumber,

            point.pickupPointId,

            user.parentId
          );
        }
      }

      /*
      =====================================
      ⚡ NEARBY ALERT
      =====================================

      BETWEEN:
      151m - 450m
      */

      if (

        distance > radius &&

        distance <= radius * 3
      ) {

        const notifications = [];

        for (const user of validUsers) {

          /*
          =================================
          CHECK GEOFENCE
          =================================
          */

          const alreadyInside =

            await wasInsideZone(

              busNumber,

              point.pickupPointId,

              user.parentId
            );

          if (alreadyInside) {
            continue;
          }

          /*
          =================================
          DEDUPLICATION
          =================================
          */

          const allowed =
            await canSendAlert(

              `${user.parentId}_${busNumber}`,

              point.pickupPointId,

              "NEARBY_ALERT"
            );

          if (!allowed) {
            continue;
          }

          /*
          =================================
          CHILD NAMES
          =================================
          */

          const childNames =

            user.children
              .map(
                (child) =>
                  child.name
              )
              .join(", ");

          /*
          =================================
          PUSH NOTIFICATION
          =================================
          */

          notifications.push(

            sendBatchNotification(

              [user.fcmToken],

              {

                title:
                  "Bus Nearby ⚡",

                body:
                  `${childNames}'s bus is approaching ${point.name}`,

                type:
                  "BUS_NEARBY",

                busNumber,

                pickupPointId:
                  point.pickupPointId,
              }
            )
          );
        }

        /*
        =====================================
        SEND ALL NOTIFICATIONS
        =====================================
        */

        await Promise.all(
          notifications
        );
      }
    }

  } catch (err) {

    console.log(
      "Engine Error:",
      err
    );
  }
}

module.exports = {
  runEngines,
};