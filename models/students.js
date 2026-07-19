const mongoose = require("mongoose");
const DeviceSchema = new mongoose.Schema(
  {
    deviceId: {
      type: String,
      required: true,
    },

    fcmToken: {
      type: String,
      required: true,
    },
  },
  {
    _id: false,
  }
);

const OtpRequestSchema = new mongoose.Schema(
  {
    deviceId: {
      type: String,
      required: true,
    },

    code: {
      type: String,
      required: true,
    },

    expiresAt: {
      type: Date,
      required: true,
    },

    attempts: {
      type: Number,
      default: 0,
    },
  },
  {
    _id: false,
  }
);
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

    },

    /*
    =========================================
    SCHOOL
    =========================================
    */

    schoolId: {
      type: String,
      required: true,
  
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
              default: "",
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
 otpRequests: {
  type: [OtpRequestSchema],
  default: [],
},
   devices: {
      type: [DeviceSchema],
      default: [],
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
StudentSchema.index(
  {
    schoolId: 1,
    parentId: 1,
    "status.active": 1,
  },
  {
        unique: true,
    name: "active_parent_lookup",
  },
);
module.exports =
  mongoose.models.Students ||
  mongoose.model(
    "Students",
    StudentSchema
  );