function normalizeLocation(point) {
  return {
    lat: point.lat ?? point.location?.coordinates?.[1],
    lng: point.lng ?? point.location?.coordinates?.[0],
  };
}

module.exports = { normalizeLocation };