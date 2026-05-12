/*
====================================================
NORMALIZE LOCATION
====================================================

SUPPORTS:
- GeoJSON
- Redis format
- Firebase format
====================================================
*/

function normalizeLocation(
  point
) {

  try {

    if (!point) {
      return null;
    }

    /*
    REDIS FORMAT
    */

    if (
      typeof point.lat === "number" &&
      typeof point.lng === "number"
    ) {

      return {
        lat: point.lat,
        lng: point.lng,
      };
    }

    /*
    GEOJSON FORMAT
    */

    if (
      point.coordinates &&
      Array.isArray(
        point.coordinates
      )
    ) {

      return {

        lng:
          point.coordinates[0],

        lat:
          point.coordinates[1],
      };
    }

    /*
    NESTED LOCATION
    */

    if (
      point.location?.coordinates
    ) {

      return {

        lng:
          point.location.coordinates[0],

        lat:
          point.location.coordinates[1],
      };
    }

    return null;

  } catch {

    return null;
  }
}

module.exports = {
  normalizeLocation,
};