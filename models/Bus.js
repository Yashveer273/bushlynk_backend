const mongoose = require("mongoose");

const busSchema = new mongoose.Schema(
  {
    busNumber: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },

    busAsignNumber: {
      type: String,
      trim: true,
    },

    schoolId: {
      type: String,
      required: true,
      trim: true,
    },

    defaultAsignDriver: {
      DriverId: {
        type: String,
        default: "",
      },
      DriverName: {
        type: String,
        default: "",
      },
      phone: {
        type: String,
        default: "",
      },
    },

    driverlogin: {
      driverId: {
        type: String,
        default: "",
      },
      assignedAt: Date,
      driverName: {
        type: String,
        default: "",
      },
    },

    status: {
      active: {
        type: Boolean,
        default: true,
      },

      tripStarted: {
        type: Boolean,
        default: false,
      },
    },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

/*
============================================================
INDEXES
============================================================
*/

// Supports GET /all with school filter and createdAt sorting
busSchema.index({
  schoolId: 1,
  createdAt: -1,
});

// Prevent duplicate dashboard bus numbers inside one school
busSchema.index(
  {
    schoolId: 1,
    busAsignNumber: 1,
  },
  {
    unique: true,
    partialFilterExpression: {
      busAsignNumber: {
        $type: "string",
      },
    },
  },
);

// Supports default-driver bus lookup
busSchema.index({
  schoolId: 1,
  busNumber: 1,
});

module.exports = mongoose.model("Bus", busSchema);