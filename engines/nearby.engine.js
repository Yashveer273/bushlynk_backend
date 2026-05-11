const redis =
  require("../config/redis");

async function nearbyEngine(
  data
) {

  try {

    const {
      busNumber,
      lat,
      lng,
    } = data;

    /*
    Store nearby status
    */

    await redis.set(

      `nearby:${busNumber}`,

      JSON.stringify({
        lat,
        lng,
        updatedAt:
          Date.now(),
      })
    );

  } catch (err) {

    console.log(
      "Nearby Engine Error:",
      err
    );
  }
}

module.exports = {
  nearbyEngine,
};