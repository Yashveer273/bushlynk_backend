const mongoose = require("mongoose");

const driverSchema = new mongoose.Schema(
  {
    driverId: {
      type: String,
      unique: true,
    },

    schoolId: String,

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

    name: String,

    phone: String,

    password: String,
  },
  {
    timestamps: true,
  },
);

module.exports = mongoose.model("Driver", driverSchema);
