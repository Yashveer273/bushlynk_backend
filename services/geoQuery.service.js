const PickupPoint = require("../models/PickupPoint");

/*
FAST GEO FILTER USING 2dsphere
*/
async function getNearbyStops({
  schoolId,
  busNumber,
  lng,
  lat,
  maxDistance = 3000,
}) {
  try {
    const docs = await PickupPoint.find({
      schoolId,
      busNumber,
      "pickupPoints.location": {
        $near: {
          $geometry: {
            type: "Point",
            coordinates: [lng, lat],
          },
          $maxDistance: maxDistance,
        },
      },
    });

    return docs.flatMap(doc => doc.pickupPoints || []);
  } catch (err) {
    console.log("GeoQuery Error:", err);
    return [];
  }
}

module.exports = { getNearbyStops };