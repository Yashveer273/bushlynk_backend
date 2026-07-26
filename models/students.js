const mongoose = require("mongoose");

const DeviceSchema = new mongoose.Schema(
  {
    deviceId: {
      type: String,
      required: true,
      trim: true,
    },
    fcmToken: {
      type: String,
      required: true,
      trim: true,
    },
    token: {
      type: String,
      default: null,
    },
    tokenExpiry: {
      type: Date,
      default: null,
    },
    lastLoginAt: {
      type: Date,
      default: Date.now,
    },
  },
  { _id: false },
);

const OtpRequestSchema = new mongoose.Schema(
  {
    deviceId: {
      type: String,
      required: true,
      trim: true,
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
  { _id: false },
);

const ChildSchema = new mongoose.Schema({
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
  busNumber: {
    type: String,
    default: "",
  },
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
});

const StudentSchema = new mongoose.Schema(
  {
    parentId: {
      type: String,
      required: true,
      unique: true,
    },
    schoolId: {
      type: String,
      required: true,
    },
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
    children: {
      type: [ChildSchema],
      default: [],
    },
    otpRequests: {
      type: [OtpRequestSchema],
      default: [],
    },
    devices: {
      type: [DeviceSchema],
      default: [],
    },
    status: {
      active: {
        type: Boolean,
        default: true,
      },
    },
  },
  { timestamps: true },
);

StudentSchema.index(
  { schoolId: 1, parentId: 1, "status.active": 1 },
  { unique: true, name: "active_parent_lookup" },
);

StudentSchema.index(
  { schoolId: 1, "parent.phone": 1, "status.active": 1 },
  { name: "active_parent_phone_lookup" },
);

StudentSchema.index(
  { schoolId: 1, "devices.deviceId": 1 },
  { name: "device_session_lookup" },
);

module.exports =
  mongoose.models.Students || mongoose.model("Students", StudentSchema);
