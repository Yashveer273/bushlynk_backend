const mongoose = require("mongoose");

/*
=====================================
PICKUP POINT SCHEMA
=====================================

Architecture:

1 bus
→ multiple default pickup points

WHY?

School buses stop at multiple
default student pickup locations.

Optimized for:
- Redis caching
- Kafka consumers
- realtime geofence engine
- ETA calculation
- scalable GPS processing
*/

const pickupPointSchema = new mongoose.Schema(
  {
    /*
        Connected school
      */
    schoolId: {
      type: String,
      required: true,
    },

    /*
        Connected bus
      */
    busNumber: {
      type: String,
      required: true,

    },

    /*
        Default geofence radius
        for all pickup points

        Can be overridden later
        if needed.
      */
    radius: {
      type: Number,
      default: 150,
    },

    /*
        Multiple default
        pickup points
      */
    pickupPoints: [
      {
        /*
            Unique pickup point ID

            Used for:
            - subscriptions
            - geofence
            - dashboard
            - Kafka workers
          */
        pickupPointId: {
          type: String,
          required: true,
        },
        status: {
          type: String,
          enum: ["DRAFT", "PUBLISHED"],
          default: "DRAFT",
        },
        // Useful for tracking who created it (Admin vs Driver)
        createdBy: {
          type: String,
          enum: ["ADMIN", "DRIVER"],
          required: true,
        },
        // Optional: Reference to the user who made the change
        lastModifiedBy: { type: String },
        /*
            Pickup point name

            Example:
            - Main Gate
            - Temple Chowk
            - Bus Stand
          */
        name: {
          type: String,
          required: true,
        },

        /*
            GEOJSON LOCATION

            IMPORTANT:

            coordinates format:
            [lng, lat]

            WHY?

            Optimized for:
            - MongoDB geo queries
            - realtime geofence engine
            - nearby matching
            - ETA engine
            - Kafka GPS consumers
          */
        location: {
          type: {
            type: String,
            enum: ["Point"],
            default: "Point",
          },

          coordinates: {
            type: [Number],
            required: true,
          },
        },

        /*
            Assigned students

            Store only IDs.

            Avoid storing:
            - names
            - phones
            - large objects

            WHY?

            Better scalability
            and lower document size.
          */
        assignedStudents: [
  {
    parentId: {
      type: String,
      required: true,
      trim: true,
    },

    studentId: {
      type: String,
      required: true,
      trim: true,
    },

    busNumber: {
      type: String,
      required: true,
      trim: true,
    },
  },
],
      },
    ],
  },
  {
    timestamps: true,
  },
);

/*
=====================================
INDEXES
=====================================
*/

/*
  Fast school lookup
*/
pickupPointSchema.index(
  {
    schoolId: 1,
    busNumber: 1,
  },
  {
    unique: true,
    name: "unique_school_bus_pickup_document",
  },
);

/*
  GEO INDEX

  VERY IMPORTANT

  Used for:
  - geofence engine
  - nearby pickup detection
  - ETA calculation
  - realtime GPS matching
*/
pickupPointSchema.index(
  {
    "pickupPoints.location": "2dsphere",
  },
  {
    name: "pickup_points_geo_index",
  },
);
/*
  NEW:

  Faster lookup when updating or deleting
  one pickup point inside a school.
*/
pickupPointSchema.index(
  {
    schoolId: 1,
    "pickupPoints.pickupPointId": 1,
  },
  {
    name: "school_pickup_point_id_lookup",
  },
);
module.exports = mongoose.model("PickupPoint", pickupPointSchema);

/*
=====================================
WHY THIS MODEL IS IMPORTANT
=====================================

✅ School defines default
pickup locations

✅ One bus supports multiple
pickup stops

✅ Parent subscriptions link
with these pickup points

✅ Kafka consumers can process
GPS stream efficiently

✅ Redis can cache:
pickup_points:BUS101

✅ Optimized for:
- realtime tracking
- scalable geofence engine
- ETA calculation
- high throughput system
*/
