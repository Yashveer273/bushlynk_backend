const mongoose = require("mongoose");

const driverSchema = new mongoose.Schema(
  {
    driverId: {
      type: String,
      unique: true,
      required: true,
      index: true,
    },

    schoolId: {
      type: String,
      required: true,
      index: true,
    },

    phone: {
      type: String,
      required: true,
      index: true,
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
module.exports = mongoose.model("Driver", driverSchema);
