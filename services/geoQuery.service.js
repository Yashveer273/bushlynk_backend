const PickupPoint =
require("../models/PickupPoint");

/*
====================================================
GET NEARBY STOPS
(PRODUCTION VERSION)
====================================================

FEATURES:
- 2dsphere optimized
- distance returned
- aggregation safe
- ETA compatible
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

        {
          $match: {
            schoolId,
            busNumber,
          },
        },

        {
          $unwind:
            "$pickupPoints",
        },

        {
          $geoNear: {

            near: {
              type: "Point",

              coordinates: [
                lng,
                lat,
              ],
            },

            key:
              "pickupPoints.location",

            distanceField:
              "distance",

            maxDistance,

            spherical: true,
          },
        },

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

            radius: 1,

            distance: 1,
          },
        },

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
      err.message
    );

    return [];
  }
}

module.exports = {
  getNearbyStops,
};