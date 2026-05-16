// ======================================================
// models/School.js
// ======================================================

const mongoose = require("mongoose");

const schoolSchema = new mongoose.Schema(
  {
    schoolId: {
      type: String,
      required: true,
      unique: true,
      index: true,
      trim: true,
      uppercase: true,
    },

    name: {
      type: String,
      required: true,
      trim: true,
    },

    address: {
      line1: String,

      city: String,

      state: String,

      country: String,

      pincode: String,
      latitude: {
    type: Number,
    default: null,
  },

  longitude: {
    type: Number,
    default: null,
  },
    },

    /*
    ==================================================
    CONTACT
    ==================================================
    */

    contact: {
      phone: {
        type: String,
        required: true,
        unique: true,
        index: true,
      },

      email: {
        type: String,
        required: true,
        unique: true,
        lowercase: true,
        trim: true,
      },
    },

    /*
    ==================================================
    OTP SYSTEM
    ==================================================
    */

   

    /*
    ==================================================
    AUTH
    ==================================================
    */

    isVerified: {
      type: Boolean,
      default: false,
    },

  tokenVersion: {
      type: Number,
      default: 0,
    },

    /*
    ==================================================
    DASHBOARD REFERENCES ONLY
    ==================================================
    */

    Students: [
      {
        parentId: String,
      },
    ],

    /*
    ==================================================
    DASHBOARD COUNTERS
    ==================================================
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

module.exports = mongoose.model(
  "School",
  schoolSchema,
);

/*
==================================================

WHY THIS STRUCTURE IS GOOD

==================================================

✅ No extra OTP schema needed

✅ OTP stored directly in school

✅ Phone and email both unique

✅ OTP expiry supported

✅ Login + Register flow supported

✅ Dashboard remains lightweight

✅ Better for small-medium scale

==================================================
*/