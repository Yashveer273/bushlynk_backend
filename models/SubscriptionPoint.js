// models/SubscriptionPoint.js

const mongoose = require("mongoose");

const subscriptionPointSchema =
  new mongoose.Schema(
    {
      /*
        Unique subscription ID
      */
      subscriptionId: {
        type: String,
        required: true,
        unique: true,
        index: true,
      },

      /*
        Parent/User ID

        Subscription belongs to parent,
        not school.
      */
      userId: {
        type: String,
        required: true,
       
      },

      /*
        Connected default pickup point

        IMPORTANT:

        Subscription is linked with
        school pickup point.

        Bus does NOT stop at
        subscription point.

        It is only used for:
        - early alert
        - nearby alert
        - preparation time
      */
      linkedPickupPointId: {
        type: String,
        required: true,
        
      },

      /*
        Optional student
      */
      

      /*
        Parent custom alert point

        Example:
        "Near Temple"
      */
      name: {
        type: String,
        required: true,
      },

      /*
        GeoJSON location

        coordinates:
        [lng, lat]

        Used for:
        - geofence
        - realtime GPS
        - nearby alerts
      */
      location: {
        

        coordinates: {
          type: [Number],
          required: true,
        },
      },

      /*
        Alert trigger radius
      */
      radius: {
        type: Number,
        default: 100,
      },

      /*
        Alert settings
      */
      alerts: {
        nearbyAlert: {
          type: Boolean,
          default: true,
        },

        arrivalAlert: {
          type: Boolean,
          default: true,
        },
      },

      /*
        Active subscription
      */
      active: {
        type: Boolean,
        default: true,
      },

      /*
        Optional expiry

        Useful for:
        - temporary stop
        - one-day stop
      */
      expiresAt: {
        type: Number,
        default: null,
      },
    },
    {
      timestamps: true,
    }
  );

/*
=====================================
INDEXES
=====================================
*/

/*
  Fast parent lookup
*/
subscriptionPointSchema.index({
  userId: 1,
});

/*
  Fast pickup point lookup
*/
subscriptionPointSchema.index({
  linkedPickupPointId: 1,
  active: 1,
});

/*
  Geo index

  Used for:
  - geofence engine
  - nearby detection
*/
subscriptionPointSchema.index({
  location: "2dsphere",
});

module.exports = mongoose.model(
  "SubscriptionPoint",
  subscriptionPointSchema
);

/*
=====================================
WHY THIS MODEL EXISTS
=====================================

Example:

Default Pickup Point:
School Gate

Parent Subscription Point:
200m before school gate

WHY?

Parent gets:
- early notification
- nearby alert
- preparation time

IMPORTANT:

❌ Bus does NOT stop here

❌ School does NOT manage this

✅ Only for parent alerts

✅ Connected with default pickup point
*/