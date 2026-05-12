const PickupPoint = require("../models/PickupPoint");

/*
====================================================
GET NEARBY STOPS (PRODUCTION READY)
====================================================

FEATURES:
- MongoDB 2dsphere optimized
- Kafka compatible
- Realtime ETA compatible
- Geofence compatible
- Distance in METERS
- Multi-stop scalable
====================================================
*/

async function getNearbyStops({

  schoolId,

  busNumber,

  lng,

  lat,

  maxDistance = 5000,
}) {

  try {

    const results =
      await PickupPoint.aggregate([

        /*
        ==========================================
        GEO NEAR MUST BE FIRST STAGE
        ==========================================
        */

        {
          $geoNear: {

            near: {

              type: "Point",

              coordinates: [
                lng,
                lat,
              ],
            },

            /*
            IMPORTANT:
            path to geo field
            */

            key:
              "pickupPoints.location",

            /*
            distance in meters
            */

            distanceField:
              "distance",

            /*
            max search radius
            */

            maxDistance,

            spherical: true,

            /*
            FILTER INSIDE geoNear
            */

            query: {

              schoolId,

              busNumber,
            },
          },
        },

        /*
        ==========================================
        UNWIND PICKUP POINTS
        ==========================================
        */

        {
          $unwind:
            "$pickupPoints",
        },

        /*
        ==========================================
        PROJECT MINIMAL DATA
        ==========================================
        */

        {
          $project: {

            _id: 0,

            pickupPointId:
              "$pickupPoints.pickupPointId",

            name:
              "$pickupPoints.name",

            location:
              "$pickupPoints.location",

            assignedStudents:
              "$pickupPoints.assignedStudents",

            /*
            DEFAULT RADIUS
            */

            radius: {

              $ifNull: [
                "$pickupPoints.radius",
                150,
              ],
            },

            /*
            Mongo returns meters
            */

            distance: 1,
          },
        },

        /*
        ==========================================
        SORT NEAREST FIRST
        ==========================================
        */

        {
          $sort: {
            distance: 1,
          },
        },
      ]);

    return results;

  } catch (err) {

    console.log(
      "GeoQuery Error:",
      err
    );

    return [];
  }
}

module.exports = {
  getNearbyStops,
};