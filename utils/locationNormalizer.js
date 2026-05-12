function normalizeLocation(point) {

  if (!point) return null;

  /*
  Already normalized
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
  GeoJSON format
  */

  if (
    Array.isArray(point.coordinates)
  ) {

    return {
      lng: point.coordinates[0],
      lat: point.coordinates[1],
    };
  }

  /*
  Nested location.coordinates
  */

  if (
    Array.isArray(
      point.location?.coordinates
    )
  ) {

    return {
      lng: point.location.coordinates[0],
      lat: point.location.coordinates[1],
    };
  }

  return null;
}

module.exports = {
  normalizeLocation,
};