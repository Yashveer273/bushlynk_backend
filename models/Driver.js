const mongoose = require("mongoose");

const driverSchema = new mongoose.Schema(
  {
    driverId: {
      type: String,
      required: true,
    },

    schoolId: {
      type: String,
      required: true,
    },

    phone: {
      type: String,
      required: true,
    },

    name: {
      type: String,
      required: true,
    },

    password: {
      type: String,
      default: null,
    },

    token: {
      type: String,
      default: null,
    },

    tokenVersion: {
      type: Number,
      default: 0,
    },

    loginHistory: [
      {
        loginAt: {
          type: Date,
          required: true,
        },
        logoutAt: {
          type: Date,
          default: null,
        },
        ipAddress: {
          type: String,
          default: "",
        },
        deviceInfo: {
          type: String,
          default: "",
        },
      },
    ],

    defaultAsignBusNumber: {
      type: String,
      default: "",
    },

    CurentJob: {
      busNumber: {
        type: String,
        default: "",
      },
      busAsignNumber: {
        type: String,
        default: "",
      },
      startedAt: {
        type: Date,
        default: null,
      },
    },
  },
  {
    timestamps: true,
  },
);

/*
  Used by:
  createDriver
  removeDriver
  getDriverByBus
  startDriverJob
  endDriverJob
  getDefaultAssignedBus
*/
driverSchema.index(
  {
    schoolId: 1,
    driverId: 1,
  },
  {
    unique: true,
  },
);

/*
  Used by:
  driverLogin
  login history by phone
*/
driverSchema.index(
  {
    schoolId: 1,
    phone: 1,
  },
  {
    unique: true,
  },
);

/*
  Used by start/end job password verification.
  This may be optional because the previous schoolId + driverId
  compound index already narrows the query to one driver.
*/
driverSchema.index({
  schoolId: 1,
  driverId: 1,
  password: 1,
});

/*
  Helpful when searching active jobs by bus number.
*/
driverSchema.index({
  schoolId: 1,
  "CurentJob.busNumber": 1,
});

/*
  Helpful for default assigned bus lookups or admin filtering.
*/
driverSchema.index({
  schoolId: 1,
  defaultAsignBusNumber: 1,
});

module.exports = mongoose.model("Driver", driverSchema);