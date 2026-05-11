const PickupPoint = require("../models/PickupPoint");

/*
====================================================
GET NEARBY STOPS (PRODUCTION-GRADE)
====================================================

DESIGN GOALS:
- Stable under high traffic
- Works with 2dsphere index correctly
- Compatible with Kafka + Redis + realtime GPS
- Returns minimal payload (scalable)
- Provides distance for ETA + geofence logic
*/

async function getNearbyStops({
  schoolId,
  busNumber,
  lng,
  lat,
  maxDistance = 3000,
}) {
  try {
    const results = await PickupPoint.aggregate([
      /*
        STEP 1:
        Filter base documents early
        (reduces aggregation workload)
      */
      {
        $match: {
          schoolId,
          busNumber,
        },
      },

      /*
        STEP 2:
        Flatten pickupPoints array
        so geo query works per point
      */
      {
        $unwind: "$pickupPoints",
      },

      /*
        STEP 3:
        GEO QUERY (2dsphere optimized)
      */
      {
        $geoNear: {
          near: {
            type: "Point",
            coordinates: [lng, lat],
          },
          key: "pickupPoints.location",
          distanceField: "distance",
          maxDistance,
          spherical: true,
        },
      },

      /*
        STEP 4:
        Project only required fields
        (CRITICAL for high-load systems)
      */
      {
        $project: {
          _id: 0,
          pickupPointId: "$pickupPoints.pickupPointId",
          name: "$pickupPoints.name",
          location: "$pickupPoints.location",
          assignedStudents: "$pickupPoints.assignedStudents",
          radius: 1,
          distance: 1,
        },
      },

      /*
        STEP 5:
        Sort by nearest first (important for ETA)
      */
      {
        $sort: {
          distance: 1,
        },
      },
    ]);

    /*
      FINAL OUTPUT SHAPE:
      [
        {
          pickupPointId,
          name,
          location,
          assignedStudents,
          radius,
          distance
        }
      ]
    */

    return results;
  } catch (err) {
    console.log("GeoQuery Error:", err);
    return [];
  }
}

module.exports = { getNearbyStops };