// services/redisSubscription.service.js

const redisClient =
  require("../config/redis");

/*
=====================================
REDIS KEY FORMAT
=====================================

pickup_subscriptions:PICKUP101

WHY?

Subscriptions belong to
pickup points.

NOT directly to buses.
*/

/*
=====================================
ADD SUBSCRIPTION
=====================================
*/

exports.addSubscriptionToRedis =
  async (subscription) => {

    try {

      const key =
        `pickup_subscriptions:${subscription.linkedPickupPointId}`;

      /*
        Store by subscriptionId

        Redis HASH used for:
        - fast update
        - fast delete
        - low memory usage
      */

      await redisClient.hSet(
        key,

        subscription.subscriptionId,

        JSON.stringify({

          subscriptionId:
            subscription.subscriptionId,

          parentId:
            subscription.parentId,

          linkedPickupPointId:
            subscription.linkedPickupPointId,
          name:
            subscription.name,

          location:
            subscription.location,

          radius:
            subscription.radius,

          alerts:
            subscription.alerts,

          active:
            subscription.active,

          expiresAt:
            subscription.expiresAt,
        })
      );

    } catch (err) {

      console.log(
        "Redis add subscription error:",
        err.message
      );
    }
};

/*
=====================================
REMOVE SUBSCRIPTION
=====================================
*/

exports.removeSubscriptionFromRedis =
  async (
    linkedPickupPointId,
    subscriptionId
  ) => {

    try {

      const key =
        `pickup_subscriptions:${linkedPickupPointId}`;

      await redisClient.hDel(
        key,
        subscriptionId
      );

    } catch (err) {

      console.log(
        "Redis remove subscription error:",
        err.message
      );
    }
};

/*
=====================================
GET PICKUP SUBSCRIPTIONS
=====================================

Used by:
- Kafka consumers
- geofence workers
- realtime GPS engine
*/

exports.getPickupSubscriptions =
  async (linkedPickupPointId) => {

    try {

      const key =
        `pickup_subscriptions:${linkedPickupPointId}`;

      const subscriptions =
        await redisClient.hVals(key);

      return subscriptions.map(
        (item) => JSON.parse(item)
      );

    } catch (err) {

      console.log(
        "Redis get subscription error:",
        err.message
      );

      return [];
    }
};