const {
  getPickupPoints,
} = require("../services/loadpicups_in_redis");

const getDistance =
  require("../utils/distance");

/*
============================================================
GET NEXT PICKUP POINT
============================================================

API:
GET /api/v1/pickup/next

QUERY:
?schoolId=SCH001&busNumber=BUS-101&lat=28.61&lng=77.23
*/

exports.getNextPickupPoint =
  async (req, res) => {

    try {

      const {
        schoolId,
        busNumber,
        lat,
        lng,
      } = req.query;

      /*
      =====================================
      VALIDATION
      =====================================
      */

      if (
        !schoolId ||
        !busNumber ||
        !lat ||
        !lng
      ) {

        return res.status(400).json({

          success: false,

          message:
            "schoolId, busNumber, lat and lng required",
        });
      }

      /*
      =====================================
      LOAD PICKUP POINTS
      =====================================
      */

      const stops =
        await getPickupPoints(
          schoolId,
          busNumber
        );

      let nextStop = null;

      let minDistance =
        Infinity;

      /*
      =====================================
      FIND NEAREST STOP
      =====================================
      */

      for (const stop of stops) {

        /*
        SAFE COORDINATE CHECK
        */

        if (
          !stop.location ||
          !stop.location.coordinates
        ) {
          continue;
        }

        const stopLat =
          stop.location.coordinates[1];

        const stopLng =
          stop.location.coordinates[0];

        const distance =
          getDistance(

            Number(lat),
            Number(lng),

            stopLat,
            stopLng
          );

        if (
          distance < minDistance
        ) {

          minDistance =
            distance;

          nextStop = {

            pickupPointId:
              stop.pickupPointId,

            name:
              stop.name,

            distance,
          };
        }
      }

      return res.status(200).json({

        success: true,

        busNumber,

        nextPickupPoint:
          nextStop,
      });

    } catch (err) {

      console.log(err);

      return res.status(500).json({

        success: false,

        message:
          "Server error",
      });
    }
  };