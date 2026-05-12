const generateId = require("../utils/generateId");

const SubscriptionPoint =
  require("../models/SubscriptionPoint");

const PickupPoint =
  require("../models/PickupPoint");

const User =
  require("../models/students");

const {
  addSubscriptionToRedis,

  removeSubscriptionFromRedis,

  getPickupSubscriptions:
    getPickupSubscriptionsFromRedis,

} = require(
  "../services/redisSubscription.service"
);

/*
=====================================================
1. CREATE SUBSCRIPTION
=====================================================

POST /subscription/create
*/

exports.createSubscription =
  async (req, res) => {

    try {

      const {

        parentId,

        childId,

        schoolId,

        busNumber,

        linkedPickupPointId,

        name,

        location,

        alerts,

      } = req.body;

      /*
      =====================================
      VALIDATION
      =====================================
      */

      if (
        !parentId ||
        !childId ||
        !schoolId ||
        !busNumber ||
        !linkedPickupPointId ||
        !name ||
        !location
      ) {

        return res.status(400).json({

          success: false,

          message:
            "Required fields missing",
        });
      }

      /*
      =====================================
      VALIDATE LOCATION
      =====================================
      */

      if (
        !Array.isArray(
          location.coordinates
        ) ||
        location.coordinates.length !== 2
      ) {

        return res.status(400).json({

          success: false,

          message:
            "Invalid location format",
        });
      }

      /*
      =====================================
      VALIDATE USER
      =====================================
      */

      const user =
        await User.findOne({
          parentId,
          schoolId,
        });

      if (!user) {

        return res.status(404).json({

          success: false,

          message:
            "Parent not found",
        });
      }

      /*
      =====================================
      VALIDATE CHILD
      =====================================
      */

      const child =
        user.children.find(
          (c) =>
            c.childId === childId
        );

      if (!child) {

        return res.status(404).json({

          success: false,

          message:
            "Child not found",
        });
      }

      /*
      =====================================
      VALIDATE BUS
      =====================================
      */

      if (
        child.busNumber !== busNumber
      ) {

        return res.status(400).json({

          success: false,

          message:
            "Child does not belong to this bus",
        });
      }

      /*
      =====================================
      VALIDATE PICKUP POINT
      =====================================
      */

      const pickupDoc =
        await PickupPoint.findOne({

          schoolId,

          busNumber,

          "pickupPoints.pickupPointId":
            linkedPickupPointId,
        });

      if (!pickupDoc) {

        return res.status(404).json({

          success: false,

          message:
            "Pickup point not found",
        });
      }

      const pickupPoint =
        pickupDoc.pickupPoints.find(
          (p) =>
            p.pickupPointId ===
            linkedPickupPointId
        );

      /*
      =====================================
      PREVENT DUPLICATE
      =====================================
      */

      const existingSubscription =
        await SubscriptionPoint.findOne({

          parentId,

          childId,

          busNumber,

          linkedPickupPointId,

          active: true,
        });

      if (existingSubscription) {

        return res.status(409).json({

          success: false,

          message:
            "Subscription already exists",
        });
      }

      /*
      =====================================
      CREATE SUBSCRIPTION
      =====================================
      */

      const expiresAt =
        new Date(

          Date.now() +
          8 * 60 * 60 * 1000
        );

      const subscription =
        await SubscriptionPoint.create({

          subscriptionId:
            `SUB-${generateId()}`,

          parentId,

          childId,

          schoolId,

          busNumber,

          linkedPickupPointId,

          name,

          location,

          alerts: {

            nearbyAlert:
              alerts?.nearbyAlert ?? true,

            arrivalAlert:
              alerts?.arrivalAlert ?? true,
          },

          expiresAt,

          active: true,
        });

      /*
      =====================================
      REDIS SYNC
      =====================================
      */

      await addSubscriptionToRedis(
        subscription
      );

      return res.status(201).json({

        success: true,

        message:
          "Subscription created successfully",

        data:
          subscription,
      });

    } catch (err) {

      console.log(err);

      return res.status(500).json({

        success: false,

        error:
          err.message,
      });
    }
  };

/*
=====================================================
2. UPDATE SUBSCRIPTION
=====================================================
*/

exports.updateSubscription =
  async (req, res) => {

    try {

      const {
        subscriptionId,
      } = req.query;

      const updateData =
        req.body;

      /*
      =====================================
      PROTECTED FIELDS
      =====================================
      */

      delete updateData.subscriptionId;

      delete updateData.parentId;

      delete updateData.childId;

      delete updateData.schoolId;

      delete updateData.busNumber;

      /*
      =====================================
      UPDATE
      =====================================
      */

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
      =====================================
      REDIS SYNC
      =====================================
      */

      if (subscription.active) {

        await addSubscriptionToRedis(
          subscription
        );

      } else {

        await removeSubscriptionFromRedis(

          subscription.busNumber,

          subscription.subscriptionId
        );
      }

      return res.status(200).json({

        success: true,

        message:
          "Subscription updated successfully",

        data:
          subscription,
      });

    } catch (err) {

      return res.status(500).json({

        success: false,

        error:
          err.message,
      });
    }
  };

/*
=====================================================
3. DELETE SUBSCRIPTION
=====================================================
*/

exports.deleteSubscription =
  async (req, res) => {

    try {

      const {
        subscriptionId,
      } = req.query;

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
      =====================================
      REDIS REMOVE
      =====================================
      */

      await removeSubscriptionFromRedis(

        subscription.busNumber,

        subscription.subscriptionId
      );

      /*
      =====================================
      DELETE
      =====================================
      */

      await SubscriptionPoint.deleteOne({

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

        error:
          err.message,
      });
    }
  };

/*
=====================================================
4. DEACTIVATE SUBSCRIPTION
=====================================================
*/

exports.deactivateSubscription =
  async (req, res) => {

    try {

      const {
        subscriptionId,
      } = req.query;

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

      subscription.active =
        false;

      await subscription.save();

      /*
      =====================================
      REMOVE FROM REDIS
      =====================================
      */

      await removeSubscriptionFromRedis(

        subscription.busNumber,

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

        error:
          err.message,
      });
    }
  };

/*
=====================================================
5. GET PICKUP SUBSCRIPTIONS
=====================================================
*/

exports.getPickupSubscriptions =
  async (req, res) => {

    try {

      const {
        busNumber,
      } = req.query;

      if (!busNumber) {

        return res.status(400).json({

          success: false,

          message:
            "busNumber required",
        });
      }

      const subscriptions =
        await getPickupSubscriptionsFromRedis(
          busNumber
        );

      return res.status(200).json({

        success: true,

        count:
          subscriptions.length,

        data:
          subscriptions,
      });

    } catch (err) {

      return res.status(500).json({

        success: false,

        error:
          err.message,
      });
    }
  };

/*
=====================================================
6. GET USER SUBSCRIPTIONS
=====================================================
*/

exports.getUserSubscriptions =
  async (req, res) => {

    try {

      const {
        parentId,
      } = req.query;

      if (!parentId) {

        return res.status(400).json({

          success: false,

          message:
            "parentId required",
        });
      }

      const subscriptions =
        await SubscriptionPoint.find({

          parentId,

          active: true,
        })

        .sort({
          createdAt: -1,
        });

      return res.status(200).json({

        success: true,

        count:
          subscriptions.length,

        data:
          subscriptions,
      });

    } catch (err) {

      return res.status(500).json({

        success: false,

        error:
          err.message,
      });
    }
  };

/*
=====================================================
7. CLEANUP EXPIRED SUBSCRIPTIONS
=====================================================
*/

exports.cleanupExpiredSubscriptions =
  async () => {

    try {

      const now =
        new Date();

      const expired =
        await SubscriptionPoint.find({

          expiresAt: {
            $lte: now,
          },
        });

      for (const sub of expired) {

        /*
        =====================================
        REDIS REMOVE
        =====================================
        */

        await removeSubscriptionFromRedis(

          sub.busNumber,

          sub.subscriptionId
        );

        /*
        =====================================
        DELETE
        =====================================
        */

        await SubscriptionPoint.deleteOne({

          subscriptionId:
            sub.subscriptionId,
        });
      }

      console.log(

        "Expired subscriptions cleaned:",

        expired.length
      );

    } catch (err) {

      console.log(
        "Cleanup Error:",
        err
      );
    }
  };