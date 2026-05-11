function normalizeLocation(point) {
  if (!point) return null;

  // Case 1: already normalized
  if (typeof point.lat === "number" && typeof point.lng === "number") {
    return {
      lat: point.lat,
      lng: point.lng,
    };
  }

  // Case 2: GeoJSON
  if (Array.isArray(point.coordinates)) {
    return {
      lng: point.coordinates[0],
      lat: point.coordinates[1],
    };
  }

  return null;
}

module.exports = { normalizeLocation };