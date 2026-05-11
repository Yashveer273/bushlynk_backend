const mongoose = require("mongoose");

const busSchema = new mongoose.Schema(
  {
    busNumber: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    busAsignNumber: {
      type: String,
    },
    schoolId: {
      type: String,
      required: true,
      index: true,
    },

    /*
      Assigned driver
    */
    driverlogin: {
      driverId: String,
      assignedAt: Date,
      driverName: String,
    },
    liveLocation: {
      lat: Number,
      lng: Number,
      speed: Number,
      heading: Number,
      updatedAt: Number,
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
  },
);

module.exports = mongoose.model("Bus", busSchema);

/*
WHY:

Bus connected with:
- school
- driver
- pickup points
- students
*/
