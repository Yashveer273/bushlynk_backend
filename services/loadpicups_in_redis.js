const PickupPoint = require("../models/PickupPoint");
const SubscriptionPoint = require("../models/SubscriptionPoint");
const redisClient = require("../config/redis");
const { normalizeLocation } = require("../utils/locationNormalizer");

/*
========================================================
LOAD PICKUP POINTS
========================================================
*/
async function loadPickupPoints() {
  try {
    const docs = await PickupPoint.find();

    for (const doc of docs) {
      const key = `pickup_points:${doc.schoolId}:${doc.busNumber}`;

      const formatted = doc.pickupPoints
        .map((p) => ({
          pickupPointId: p.pickupPointId,
          name: p.name,

          location: normalizeLocation(p.location), // ✅ FIXED

          radius: doc.radius,
          assignedStudents: p.assignedStudents,
        }))
        .filter(Boolean);

      await redisClient.set(key, JSON.stringify(formatted));
    }

    console.log("✅ Pickup points loaded");
  } catch (err) {
    console.log("Pickup load error:", err);
  }
}

/*
========================================================
LOAD SUBSCRIPTIONS
========================================================
*/
async function loadSubscriptionPoints() {
  try {
    const subs = await SubscriptionPoint.find({ active: true });

    const grouped = {};

    for (const sub of subs) {
      const key = `bus_subscriptions:${sub.busNumber}`;

      if (!grouped[key]) grouped[key] = [];

      grouped[key].push({
        subscriptionId: sub.subscriptionId,
        userId: sub.userId,
        linkedPickupPointId: sub.linkedPickupPointId,
        name: sub.name,

        location: normalizeLocation(sub.location), // ✅ FIXED

        radius: sub.radius,
        alerts: sub.alerts,
        expiresAt: sub.expiresAt,
      });
    }

    for (const key in grouped) {
      await redisClient.set(key, JSON.stringify(grouped[key]));
    }

    console.log("✅ Subscriptions loaded");
  } catch (err) {
    console.log("Subscription load error:", err);
  }
}

/*
========================================================
GETTERS
========================================================
*/
async function getPickupPoints(schoolId, busNumber) {
  try {
    const key = `pickup_points:${schoolId}:${busNumber}`;
    const data = await redisClient.get(key);
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
}

async function getSubscriptionPoints(busNumber) {
  try {
    const key = `bus_subscriptions:${busNumber}`;
    const data = await redisClient.get(key);
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
}

module.exports = {
  loadPickupPoints,
  loadSubscriptionPoints,
  getPickupPoints,
  getSubscriptionPoints,
};