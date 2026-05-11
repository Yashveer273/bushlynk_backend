const mongoose = require("mongoose");

const schoolSchema = new mongoose.Schema(
  {
    schoolId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },

    name: {
      type: String,
      required: true,
    },

    address: {
      line1: String,
      city: String,
      state: String,
      country: String,
      pincode: String,
    },

    contact: {
      phone: String,
      email: String,
    },

    /*
      Dashboard references only
      NOT full data
    */

    Students: [
      {
        userId: String,
      },
    ],

    /*
      Dashboard counters
    */
    stats: {
      totalStudents: {
        type: Number,
        default: 0,
      },

      totalDrivers: {
        type: Number,
        default: 0,
      },

      totalBuses: {
        type: Number,
        default: 0,
      },
    },
  },
  {
    timestamps: true,
  },
);

module.exports = mongoose.model("School", schoolSchema);

/*
WHY THIS IS CORRECT:

✅ School dashboard can quickly see:
- buses
- drivers
- Students

✅ But actual full data stays
in separate collections

✅ Avoids huge document problem

✅ Easy dashboard management
*/
