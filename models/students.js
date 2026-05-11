const mongoose = require("mongoose");

const Studentschema = new mongoose.Schema(
  {
    userId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },

    schoolId: {
      type: String,
      required: true,
      index: true,
    },

    /*
      Parent information
    */
    parent: {
      name: String,
      phone: String,
      email: String,
    },

    /*
      Child/student information
    */
    child: {
      studentId: String,
      name: String,
      class: String,
      section: String,
      rollNumber: String,
    },

    /*
      Connected bus
    */
    busNumber: {
      type: String,
      required: true,
      index: true,
    },

    /*
      Default pickup point
    */
    pickupPointId: {
      type: String,
      default: null,
    },

    /*
      Firebase notification token
    */
    fcmToken: {
      type: String,
      default: null,
    },

    /*
      OTP for parent login
    */
    otp: {
      code: String,
      expiresAt: Date,
      attempts: {
        type: Number,
        default: 0,
      },
    },

    status: {
      active: {
        type: Boolean,
        default: true,
      },
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model(
  "User",
  Studentschema
);

/*
WHY:

Each parent + child:
- connected to school
- connected to bus
- connected to pickup point

Perfect for dashboard filtering
*/