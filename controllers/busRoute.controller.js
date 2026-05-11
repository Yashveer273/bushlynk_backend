const { getPickupPoints } = require("../services/loadpicups_in_redis");
const getDistance = require("../utils/distance");

exports.getNextPickupPoint = async (req, res) => {
  try {
    const { schoolId, busNumber, lat, lng } = req.query;

    if (!schoolId || !busNumber) {
      return res.status(400).json({
        success: false,
        message: "schoolId and busNumber required",
      });
    }

    const stops = await getPickupPoints(schoolId, busNumber);

    let nextStop = null;
    let minDistance = Infinity;

    for (const stop of stops) {

      const stopLat = stop.location.coordinates[1];
      const stopLng = stop.location.coordinates[0];

      const distance = getDistance(lat, lng, stopLat, stopLng);

      if (distance < minDistance) {
        minDistance = distance;

        nextStop = {
          pickupPointId: stop.pickupPointId,
          name: stop.name,
          distance,
        };
      }
    }

    return res.json({
      success: true,
      busNumber,
      nextPickupPoint: nextStop,
    });

  } catch (err) {
    console.log(err);

    return res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};