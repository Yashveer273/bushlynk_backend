const { getSubscriptionPoints } = require("../services/loadpicups_in_redis");
const getDistance = require("../utils/distance");
const { sendAlert } = require("../services/notificationService");
const { normalizeLocation } = require("../utils/locationNormalizer");

async function subscriptionEngine(data) {
  try {
    const { busNumber, lat, lng } = data;

    const subs = await getSubscriptionPoints(busNumber);

    for (const sub of subs) {
      const loc = normalizeLocation(sub.location);

      const distance = getDistance(lat, lng, loc.lat, loc.lng);

      if (distance <= 200) {
        await sendAlert({
          type: "subscription_alert",
          userId: sub.userId,
          title: "Bus Near Your Stop",
          body: "Bus is near your custom pickup point",
          busNumber,
        });
      }
    }
  } catch (err) {
    console.log("Subscription Engine Error:", err);
  }
}

module.exports = { subscriptionEngine };