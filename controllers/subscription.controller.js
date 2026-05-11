// controllers/subscription.controller.js

const generateId =
  require("../utils/generateId");

const SubscriptionPoint =
  require(
    "../models/SubscriptionPoint"
  );

const PickupPoint =
  require(
    "../models/PickupPoint"
  );

const {
  addSubscriptionToRedis,

  removeSubscriptionFromRedis,

  getPickupSubscriptions,

} = require(
  "../services/redisSubscription.service"
);

/*
=====================================
1. CREATE SUBSCRIPTION
=====================================
*/

exports.createSubscription =
  async (req, res) => {

    try {

      const {
        userId,
        linkedPickupPointId,
        child,
        name,
        location,
        radius,
        alerts,
        expiresAt,
      } = req.body;

      /*
        Validate pickup point
      */

      const pickupPoint =
        await PickupPoint.findOne({
          pickupPointId:
            linkedPickupPointId,
        });

      if (!pickupPoint) {

        return res.status(404).json({
          success: false,

          message:
            "Pickup point not found",
        });
      }

      /*
        Validate GeoJSON
      */

      if (
        !location ||
        
        !Array.isArray(
          location.coordinates
        )
      ) {

        return res.status(400).json({
          success: false,

          message:
            "Invalid location format",
        });
      }

      const subscription =
        await SubscriptionPoint.create({

          subscriptionId:
            `SUB-${generateId()}`,

          userId,

          linkedPickupPointId,

          child,

          name,

          location,

          radius,

          alerts,

          expiresAt,
        });

      /*
        Cache in Redis

        Used by Kafka geofence workers
      */

      await addSubscriptionToRedis(
        subscription
      );

      return res.status(201).json({
        success: true,

        message:
          "Subscription created successfully",

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
=====================================
2. UPDATE SUBSCRIPTION
=====================================
*/

exports.updateSubscription =
  async (req, res) => {

    try {

    const { subscriptionId } = req.query;

      const updateData =
        req.body;

      /*
        Protected fields
      */

      delete updateData.subscriptionId;

      delete updateData.userId;

      const subscription =
        await SubscriptionPoint.findOneAndUpdate(
          {
            subscriptionId,
          },
          updateData,
          {
            new: true,
            runValidators: true,
          }
        );

      if (!subscription) {

        return res.status(404).json({
          success: false,

          message:
            "Subscription not found",
        });
      }

      /*
        Sync Redis
      */

      if (subscription.active) {

        await addSubscriptionToRedis(
          subscription
        );

      } else {

        await removeSubscriptionFromRedis(
          subscription.linkedPickupPointId,
          subscription.subscriptionId
        );
      }

      return res.status(200).json({
        success: true,

        message:
          "Subscription updated successfully",

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
=====================================
3. DELETE SUBSCRIPTION
=====================================
*/

exports.deleteSubscription =
  async (req, res) => {

    try {

      const { subscriptionId }  =
        req.query;

      const subscription =
        await SubscriptionPoint.findOne({
          subscriptionId,
        });

      if (!subscription) {

        return res.status(404).json({
          success: false,

          message:
            "Subscription not found",
        });
      }

      /*
        Remove from Redis
      */

      await removeSubscriptionFromRedis(
        subscription.linkedPickupPointId,
        subscription.subscriptionId
      );

      /*
        Remove from MongoDB
      */

      await SubscriptionPoint.findOneAndDelete({
        subscriptionId,
      });

      return res.status(200).json({
        success: true,

        message:
          "Subscription deleted successfully",
      });

    } catch (err) {

      return res.status(500).json({
        success: false,
        error: err.message,
      });
    }
};

/*
=====================================
4. DEACTIVATE SUBSCRIPTION
=====================================
*/

exports.deactivateSubscription =
  async (req, res) => {

    try {

      const { subscriptionId }  =
        req.query;

      const subscription =
        await SubscriptionPoint.findOne({
          subscriptionId,
        });

      if (!subscription) {

        return res.status(404).json({
          success: false,

          message:
            "Subscription not found",
        });
      }

      subscription.active = false;

      await subscription.save();

      /*
        Remove from Redis
      */

      await removeSubscriptionFromRedis(
        subscription.linkedPickupPointId,
        subscription.subscriptionId
      );

      return res.status(200).json({
        success: true,

        message:
          "Subscription deactivated",
      });

    } catch (err) {

      return res.status(500).json({
        success: false,
        error: err.message,
      });
    }
};

/*
=====================================
5. GET PICKUP SUBSCRIPTIONS
=====================================

Used internally by:
- Kafka workers
- geofence engine
*/

exports.getPickupSubscriptions =
  async (req, res) => {

    try {

      const { linkedPickupPointId } = req.query;
      const subscriptions =
        await getPickupSubscriptions(
          linkedPickupPointId
        );

      return res.status(200).json({
        success: true,

        count:
          subscriptions.length,

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
=====================================
GET USER SUBSCRIPTIONS
=====================================

Returns all active subscriptions
created by parent/user.

Used in:
- parent dashboard
- mobile app
- subscription management
*/

exports.getUserSubscriptions =
  async (req, res) => {

    try {

      const { userId } = req.query;


      /*
        Get active subscriptions
        for user
      */

      const subscriptions =
        await SubscriptionPoint.find({
          userId,
          active: true,
        })
        .lean()
        .sort({
          createdAt: -1,
        });

      return res.status(200).json({
        success: true,

        count:
          subscriptions.length,

        data: subscriptions,
      });

    } catch (err) {

      return res.status(500).json({
        success: false,
        error: err.message,
      });
    }
};