const mongoose = require("mongoose");

const StudentSchema = new mongoose.Schema(
  {
    /*
    =========================================
    PARENT ID
    =========================================
    */

    parentId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },

    /*
    =========================================
    SCHOOL
    =========================================
    */

    schoolId: {
      type: String,
      required: true,
      index: true,
    },

    /*
    =========================================
    PARENT INFORMATION
    =========================================
    */

    parent: {

      name: {
        type: String,
        required: true,
      },

      phone: {
        type: String,
        required: true,
      },

    
    },

    /*
    =========================================
    MULTIPLE CHILDREN
    =========================================
    */

    children: [

      {

        /*
        CHILD INFORMATION
        */

        childId: {
          type: String,
          required: true,
        },

        studentId: {
          type: String,
          required: true,
        },

        name: {
          type: String,
          required: true,
        },

        class: {
          type: String,
          required: true,
        },

        section: {
          type: String,
          required: true,
        },

        rollNumber: {
          type: String,
          required: true,
        },

        /*
        BUS FOR THIS CHILD
        */

        busNumber: {
          type: String,
          required: true,
        },

        /*
        PICKUP POINT FOR THIS CHILD
        */

        pickupPointId: {
          type: String,
          default: null,
        },

        status: {

          active: {
            type: Boolean,
            default: true,
          },
        },
      },
    ],

    /*
    =========================================
    FCM TOKEN
    =========================================
    */
 otp: {
      code: String,
      expiresAt: Date,
      attempts: {
        type: Number,
        default: 0,
      },
    },
    fcmToken: {
      type: String,
      default: null,
    },

    /*
    =========================================
    ACCOUNT STATUS
    =========================================
    */

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
  "Students",
  StudentSchema
);
