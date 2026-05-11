const generateId = require("../utils/generateId");

const SubscriptionPoint = require("../models/SubscriptionPoint");
const PickupPoint = require("../models/PickupPoint");

const {
  addSubscriptionToRedis,
  removeSubscriptionFromRedis,
  getPickupSubscriptions,
} = require("../services/redisSubscription.service");

/*
=====================================================
1. CREATE SUBSCRIPTION
=====================================================

📌 PURPOSE:
Create a new subscription for a parent/user.

📌 WHEN USED:
- Parent selects custom alert location
- System starts monitoring bus distance

📌 API:
POST /subscription/create

📌 REQUEST BODY:
{
  "userId": "U12345",
  "linkedPickupPointId": "PICKUP101",
  "name": "Near Temple Stop",
  "location": {
    "coordinates": [77.1025, 28.7041]
  },
  "alerts": {
    "nearbyAlert": true,
    "arrivalAlert": true
  }
}
*/
exports.createSubscription = async (req, res) => {
  try {
    const {
      userId,
      linkedPickupPointId,
      name,
      location,
      alerts,
    } = req.body;

    const pickupPoint = await PickupPoint.findOne({
      pickupPointId: linkedPickupPointId,
    });

    if (!pickupPoint) {
      return res.status(404).json({
        success: false,
        message: "Pickup point not found",
      });
    }

    if (!location || !Array.isArray(location.coordinates)) {
      return res.status(400).json({
        success: false,
        message: "Invalid location format",
      });
    }

    const expiresAt = Date.now() + 8 * 60 * 60 * 1000;

    const subscription = await SubscriptionPoint.create({
      subscriptionId: `SUB-${generateId()}`,
      userId,
      linkedPickupPointId,
      name,
      location,
      alerts: {
        nearbyAlert: alerts?.nearbyAlert ?? true,
        arrivalAlert: alerts?.arrivalAlert ?? true,
      },
      expiresAt,
      active: true,
    });

    await addSubscriptionToRedis(subscription);

    return res.status(201).json({
      success: true,
      message: "Subscription created successfully",
      data: subscription,
    });

  } catch (err) {
    return res.status(500).json({
      success: false,
      error: err.message,
    });
  }
};

/*
=====================================================
2. UPDATE SUBSCRIPTION
=====================================================

📌 PURPOSE:
Update alert settings or subscription details.

📌 API:
PUT /subscription/update?subscriptionId=SUB-123

📌 REQUEST BODY:
{
  "name": "Updated Stop Name",
  "alerts": {
    "nearbyAlert": false,
    "arrivalAlert": true
  }
}
*/
exports.updateSubscription = async (req, res) => {
  try {
    const { subscriptionId } = req.query;
    const updateData = req.body;

    delete updateData.subscriptionId;
    delete updateData.userId;

    const subscription = await SubscriptionPoint.findOneAndUpdate(
      { subscriptionId },
      updateData,
      { new: true, runValidators: true }
    );

    if (!subscription) {
      return res.status(404).json({
        success: false,
        message: "Subscription not found",
      });
    }

    if (subscription.active) {
      await addSubscriptionToRedis(subscription);
    } else {
      await removeSubscriptionFromRedis(
        subscription.linkedPickupPointId,
        subscription.subscriptionId
      );
    }

    return res.status(200).json({
      success: true,
      message: "Subscription updated successfully",
      data: subscription,
    });

  } catch (err) {
    return res.status(500).json({
      success: false,
      error: err.message,
    });
  }
};

/*
=====================================================
3. DELETE SUBSCRIPTION
=====================================================

📌 API:
DELETE /subscription/delete?subscriptionId=SUB-123

📌 PURPOSE:
Hard delete subscription from system + Redis cleanup
*/
exports.deleteSubscription = async (req, res) => {
  try {
    const { subscriptionId } = req.query;

    const subscription = await SubscriptionPoint.findOne({
      subscriptionId,
    });

    if (!subscription) {
      return res.status(404).json({
        success: false,
        message: "Subscription not found",
      });
    }

    await removeSubscriptionFromRedis(
      subscription.linkedPickupPointId,
      subscription.subscriptionId
    );

    await SubscriptionPoint.findOneAndDelete({
      subscriptionId,
    });

    return res.status(200).json({
      success: true,
      message: "Subscription deleted successfully",
    });

  } catch (err) {
    return res.status(500).json({
      success: false,
      error: err.message,
    });
  }
};

/*
=====================================================
4. DEACTIVATE SUBSCRIPTION
=====================================================

📌 API:
PATCH /subscription/deactivate?subscriptionId=SUB-123

📌 PURPOSE:
Soft disable subscription (no notifications)
*/
exports.deactivateSubscription = async (req, res) => {
  try {
    const { subscriptionId } = req.query;

    const subscription = await SubscriptionPoint.findOne({
      subscriptionId,
    });

    if (!subscription) {
      return res.status(404).json({
        success: false,
        message: "Subscription not found",
      });
    }

    subscription.active = false;
    await subscription.save();

    await removeSubscriptionFromRedis(
      subscription.linkedPickupPointId,
      subscription.subscriptionId
    );

    return res.status(200).json({
      success: true,
      message: "Subscription deactivated",
    });

  } catch (err) {
    return res.status(500).json({
      success: false,
      error: err.message,
    });
  }
};

/*
=====================================================
5. GET PICKUP SUBSCRIPTIONS
=====================================================

📌 API:
GET /subscription/pickup?linkedPickupPointId=PICKUP101

📌 PURPOSE:
Used by Kafka / geofence engine (REALTIME BUS TRACKING)
*/
exports.getPickupSubscriptions = async (req, res) => {
  try {
    const { linkedPickupPointId } = req.query;

    const subscriptions = await getPickupSubscriptions(
      linkedPickupPointId
    );

    return res.status(200).json({
      success: true,
      count: subscriptions.length,
      data: subscriptions,
    });

  } catch (err) {
    return res.status(500).json({
      success: false,
      error: err.message,
    });
  }
};

/*
=====================================================
6. GET USER SUBSCRIPTIONS
=====================================================

📌 API:
GET /subscription/user?userId=U12345

📌 PURPOSE:
User dashboard subscription listing
*/
exports.getUserSubscriptions = async (req, res) => {
  try {
    const { userId } = req.query;

    const subscriptions = await SubscriptionPoint.find({
      userId,
      active: true,
    }).sort({ createdAt: -1 });

    return res.status(200).json({
      success: true,
      count: subscriptions.length,
      data: subscriptions,
    });

  } catch (err) {
    return res.status(500).json({
      success: false,
      error: err.message,
    });
  }
};

/*
=====================================================
7. AUTO CLEANUP (CRON JOB ONLY)
=====================================================

📌 PURPOSE:
Remove expired subscriptions (NO NOTIFICATIONS SENT)

📌 RUN:
Cron Job (every 30-60 mins recommended)
*/
exports.cleanupExpiredSubscriptions = async () => {
  try {
    const now = Date.now();

    const expired = await SubscriptionPoint.find({
      expiresAt: { $lte: now },
    });

    for (const sub of expired) {
      await removeSubscriptionFromRedis(
        sub.linkedPickupPointId,
        sub.subscriptionId
      );

      await SubscriptionPoint.deleteOne({
        subscriptionId: sub.subscriptionId,
      });
    }

    console.log("Expired subscriptions cleaned:", expired.length);

  } catch (err) {
    console.log("Cleanup Error:", err);
  }
};