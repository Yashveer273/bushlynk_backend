const generateId = require("../utils/generateId");
const mongoose = require("mongoose");
const jwt = require("jsonwebtoken");
const { performance } = require("node:perf_hooks");
const JWT_SECRET="0000000";
const JWT_EXPIRES_IN="30d";
const User = require("../models/students");
const School = require("../models/School");
const PickupPoint = require("../models/PickupPoint");

/*
IMPORTANT:
- This file changes ONLY the controller.
- Existing schemas, routes, middleware, token logic and API paths remain unchanged.
- Keep your existing redisClient import/initialization if it already exists in this controller.
*/

const finishTiming = (res, apiStartedAt, databaseTime = 0) => {
  res.setHeader("x-database-time", `${databaseTime.toFixed(2)}ms`);
  res.setHeader("x-api-time", `${(performance.now() - apiStartedAt).toFixed(2)}ms`);
};

const cleanText = (value) => String(value ?? "").trim();
const createOtp = () =>
  Math.floor(100000 + Math.random() * 900000).toString();

const normalizePhone = (value) =>
  String(value || "").replace(/\D/g, "");

const createDeviceSession = ({ userId, parentId, schoolId, deviceId }) => {
  if (!JWT_SECRET) {
    throw new Error("JWT_SECRET is not configured");
  }

  const token = jwt.sign(
    {
      userId: String(userId),
      parentId: String(parentId),
      schoolId: String(schoolId),
      deviceId: String(deviceId),
      role: "parent",
    },
    JWT_SECRET,
    {
      expiresIn: JWT_EXPIRES_IN || "30d",
    },
  );

  const decodedToken = jwt.decode(token);

  if (!decodedToken?.exp) {
    throw new Error("Unable to calculate token expiry");
  }

  return {
    token,
    tokenExpiry: new Date(decodedToken.exp * 1000),
  };
};

/*
===============================================================================
1. SEND REGISTER OTP / 2. VERIFY REGISTER OTP / 3. CREATE STUDENT
===============================================================================
*/
exports.sendRegisterOTP = async (req, res) => {
  return res.status(410).json({
    success: false,
    message:
      "Registration OTP is disabled. College authority creates parent records directly.",
  });
};

exports.verifyRegisterOTP = async (req, res) => {
  return res.status(410).json({
    success: false,
    message:
      "Registration OTP verification is disabled. College authority creates parent records directly.",
  });
};

exports.createStudent = async (req, res) => {
  const apiStartedAt = performance.now();
  let databaseTime = 0;

  try {
    /*
    Parent creation is an authority-only operation.

    No OTP, JWT, deviceId or FCM token is required here.
    The devices array remains empty until the parent logs in.
    */
    const { schoolId } = req.user;
    const { parent, child } = req.body;

    const parentName = cleanText(parent?.name);
    const parentPhone = normalizePhone(parent?.phone);
    const children = Array.isArray(child) ? child : [];
    const missingFields = [];

    if (!schoolId) missingFields.push("schoolId");
    if (!parentName) missingFields.push("parent.name");

    if (!/^[6-9]\d{9}$/.test(parentPhone)) {
      missingFields.push("valid parent.phone");
    }

    if (!children.length) {
      missingFields.push("child array");
    } else {
      children.forEach((item, index) => {
        if (!cleanText(item?.studentId)) {
          missingFields.push(`child[${index}].studentId`);
        }
        if (!cleanText(item?.name)) {
          missingFields.push(`child[${index}].name`);
        }
        if (!cleanText(item?.class)) {
          missingFields.push(`child[${index}].class`);
        }
        if (!cleanText(item?.section)) {
          missingFields.push(`child[${index}].section`);
        }
        if (!cleanText(item?.rollNumber)) {
          missingFields.push(`child[${index}].rollNumber`);
        }
      });
    }

    if (missingFields.length) {
      finishTiming(res, apiStartedAt, databaseTime);
      return res.status(400).json({
        success: false,
        message: "Required fields missing",
        missingFields,
      });
    }

    const childrenDataArray = children.map((item) => ({
      studentId: cleanText(item.studentId),
      name: cleanText(item.name),
      class: cleanText(item.class),
      section: cleanText(item.section),
      rollNumber: cleanText(item.rollNumber),
      busNumber: cleanText(item.busNumber),
      pickupPointId:
        item.pickupPointId === undefined || item.pickupPointId === null
          ? null
          : cleanText(item.pickupPointId) || null,
      status: {
        active: item?.status?.active !== false,
      },
    }));

    const studentIds = childrenDataArray.map((item) => item.studentId);

    if (new Set(studentIds).size !== studentIds.length) {
      finishTiming(res, apiStartedAt, databaseTime);
      return res.status(409).json({
        success: false,
        message: "Duplicate studentId exists in the submitted child array",
      });
    }

    const checkStartedAt = performance.now();

    const [schoolExists, existingParent, existingStudent] =
      await Promise.all([
        School.exists({ schoolId }),
        User.exists({
          schoolId,
          "parent.phone": parentPhone,
          "status.active": true,
        }),
        User.exists({
          schoolId,
          "children.studentId": { $in: studentIds },
        }),
      ]);

    databaseTime += performance.now() - checkStartedAt;

    if (!schoolExists) {
      finishTiming(res, apiStartedAt, databaseTime);
      return res.status(404).json({
        success: false,
        message: "School not found",
      });
    }

    if (existingParent) {
      finishTiming(res, apiStartedAt, databaseTime);
      return res.status(409).json({
        success: false,
        message: "This parent phone is already registered in this school",
      });
    }

    if (existingStudent) {
      finishTiming(res, apiStartedAt, databaseTime);
      return res.status(409).json({
        success: false,
        message: "One or more submitted student IDs already exist",
      });
    }

    const writeStartedAt = performance.now();

    const createdParent = await User.create({
      parentId: generateId("PAR"),
      schoolId,
      parent: {
        name: parentName,
        phone: parentPhone,
      },
      children: childrenDataArray,
      otpRequests: [],
      devices: [],
      status: {
        active: true,
      },
    });

    databaseTime += performance.now() - writeStartedAt;

    const responseData = createdParent.toObject();
    delete responseData.otpRequests;
    delete responseData.devices;

    finishTiming(res, apiStartedAt, databaseTime);
    return res.status(201).json({
      success: true,
      message:
        "Parent and student account created successfully without OTP",
      data: responseData,
    });
  } catch (error) {
    finishTiming(res, apiStartedAt, databaseTime);

    if (error?.code === 11000) {
      return res.status(409).json({
        success: false,
        message: "Parent ID, phone or student record already exists",
      });
    }

    return res.status(500).json({
      success: false,
      message: "Unable to create student account",
      error: error.message,
    });
  }
};

exports.addChild = async (req, res) => {
  const apiStartedAt = performance.now();
  let databaseTime = 0;

  try {
    const { parentId } = req.params;
    const { schoolId } = req.user;
    const {
      studentId,
      name,
      class: studentClass,
      section,
      rollNumber,
    } = req.body;

    if (!parentId || parentId === "undefined") {
      finishTiming(res, apiStartedAt, databaseTime);
      return res.status(400).json({
        success: false,
        message: "Parent ID is required",
      });
    }

    const missingFields = [];
    if (!studentId) missingFields.push("studentId");
    if (!name) missingFields.push("name");
    if (!studentClass) missingFields.push("class");
    if (!section) missingFields.push("section");
    if (!rollNumber) missingFields.push("rollNumber");

    if (missingFields.length) {
      finishTiming(res, apiStartedAt, databaseTime);
      return res.status(400).json({
        success: false,
        message: "Required fields missing",
        missingFields,
      });
    }

    const dbStart = performance.now();

    const user = await User.findOneAndUpdate(
      {
        parentId,
        schoolId,
        "children.studentId": { $ne: studentId },
      },
      {
        $push: {
          children: {
            childId: generateId("CHI"),
            studentId,
            name,
            class: studentClass,
            section,
            rollNumber,
            status: { active: true },
          },
        },
      },
      {
        new: true,
        lean: true,
      },
    );

    databaseTime += performance.now() - dbStart;

    if (!user) {
      const existsStart = performance.now();
      const parentExists = await User.exists({ parentId, schoolId });
      databaseTime += performance.now() - existsStart;

      finishTiming(res, apiStartedAt, databaseTime);
      return res.status(parentExists ? 409 : 404).json({
        success: false,
        message: parentExists
          ? "Student ID already exists under this parent"
          : "Parent not found",
      });
    }

    finishTiming(res, apiStartedAt, databaseTime);
    return res.status(200).json({
      success: true,
      message: "Child added successfully",
      data: user,
    });
  } catch (error) {
    finishTiming(res, apiStartedAt, databaseTime);
    return res.status(500).json({
      success: false,
      message: "Server Error",
      error: error.message,
    });
  }
};

/*
===============================================================================
5. GET STUDENT IDS BY PARENT PHONE
===============================================================================
*/
exports.getStudentIdsByParentPhone = async (req, res) => {
  const apiStartedAt = performance.now();
  let databaseTime = 0;

  try {
    const cleanPhone = String(req.params.phone || "").replace(/\D/g, "");
    const { schoolId } = req.user;

    if (!/^[6-9]\d{9}$/.test(cleanPhone)) {
      finishTiming(res, apiStartedAt, databaseTime);
      return res.status(400).json({
        success: false,
        message: "Valid 10-digit phone number is required",
      });
    }

    const dbStart = performance.now();

    const parent = await User.findOne(
      {
        schoolId,
        "parent.phone": cleanPhone,
      },
      {
        _id: 0,
        parentId: 1,
        "children.studentId": 1,
        "children.name": 1,
      },
    ).lean();

    databaseTime += performance.now() - dbStart;

    if (!parent) {
      finishTiming(res, apiStartedAt, databaseTime);
      return res.status(404).json({
        success: false,
        message: "Parent not found",
      });
    }

    finishTiming(res, apiStartedAt, databaseTime);
    return res.status(200).json({
      success: true,
      message: "Parent and student IDs fetched successfully",
      data: {
        parentId: parent.parentId,
        children: parent.children.map((item) => ({
          studentId: item.studentId,
          studentName: item.name || null,
        })),
      },
    });
  } catch (error) {
    finishTiming(res, apiStartedAt, databaseTime);
    return res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};

/*
===============================================================================
6. SEND LOGIN OTP
===============================================================================
*/
exports.sendOTP = async (req, res) => {
  const apiStartedAt = performance.now();
  let databaseTime = 0;

  try {
    const { parentPhone, deviceId, schoolId } = req.body;

    console.log("SEND OTP REQUEST");
    console.log({
      schoolId,
      parentPhone,
      deviceId,
    });

    if (!schoolId || !parentPhone || !deviceId) {
      finishTiming(res, apiStartedAt, databaseTime);

      return res.status(400).json({
        success: false,
        message: "schoolId, parentPhone and deviceId are required",
      });
    }

    const cleanSchoolId = schoolId.toString().trim();
    const cleanParentPhone = parentPhone.toString().trim();
    const cleanDeviceId = deviceId.toString().trim();

    const now = new Date();
    const readStart = performance.now();

    const existingUser = await User.findOne(
      {
        schoolId: cleanSchoolId,
        "parent.phone": cleanParentPhone,
        "status.active": true,
      },
      {
        _id: 1,
        parentId: 1,
        otpRequests: {
          $elemMatch: {
            deviceId: cleanDeviceId,
            expiresAt: { $gt: now },
            attempts: { $lt: 5 },
          },
        },
      },
    ).lean();

    databaseTime += performance.now() - readStart;

    if (!existingUser) {
      finishTiming(res, apiStartedAt, databaseTime);

      return res.status(404).json({
        success: false,
        message: "Parent account not found for selected school",
      });
    }

    if (existingUser.otpRequests?.length) {
      const existingOtp = existingUser.otpRequests[0];

      console.log(
        `Existing OTP reused for ${cleanParentPhone}, device ${cleanDeviceId}`,
      );

      finishTiming(res, apiStartedAt, databaseTime);

      return res.status(200).json({
        success: true,
        message: "Existing OTP sent again",
        data: {
          otp: existingOtp.code,
          reusedOtp: true,
          expiresInSeconds: Math.max(
            0,
            Math.floor(
              (new Date(existingOtp.expiresAt).getTime() - Date.now()) / 1000,
            ),
          ),
        },
      });
    }

    const otp = createOtp();
    const expiresAt = new Date(Date.now() + 60 * 1000);

    const updateStart = performance.now();

    const result = await User.updateOne(
      {
        _id: existingUser._id,
        "status.active": true,
      },
      [
        {
          $set: {
            otpRequests: {
              $concatArrays: [
                {
                  $filter: {
                    input: {
                      $ifNull: ["$otpRequests", []],
                    },
                    as: "request",
                    cond: {
                      $ne: [
                        "$$request.deviceId",
                        cleanDeviceId,
                      ],
                    },
                  },
                },
                [
                  {
                    deviceId: cleanDeviceId,
                    code: otp,
                    expiresAt,
                    attempts: 0,
                  },
                ],
              ],
            },
          },
        },
      ],
      {
        updatePipeline: true,
      },
    );

    databaseTime += performance.now() - updateStart;

    if (!result.matchedCount) {
      finishTiming(res, apiStartedAt, databaseTime);

      return res.status(404).json({
        success: false,
        message: "Parent account not found",
      });
    }

    console.log(
      `New OTP for ${cleanParentPhone}, device ${cleanDeviceId}: ${otp}`,
    );

    finishTiming(res, apiStartedAt, databaseTime);

    return res.status(200).json({
      success: true,
      message: "OTP sent successfully",
      data: {
       
        reusedOtp: false,
        expiresInSeconds: 60,
      },
    });
  } catch (error) {
    console.error("SEND OTP ERROR:", error);

    finishTiming(res, apiStartedAt, databaseTime);

    return res.status(500).json({
      success: false,
      message: "Unable to send OTP",
      error: error.message,
    });
  }
};


// POST /api/student/find-schools
exports.findSchoolsByParentPhone = async (req, res) => {
  const apiStartedAt = performance.now();
  let databaseTime = 0;

  try {
    const parentPhone = req.body.parentPhone?.toString().trim();

    if (!parentPhone) {
      finishTiming(res, apiStartedAt, databaseTime);
console.log("Parent phone number is required");
      return res.status(400).json({
        success: false,
        message: "Parent phone number is required",
      });
    }

    /*
      Step 1:
      Find every active parent account connected with this phone number.

      distinct() automatically returns unique school IDs, so duplicate
      records from the same school do not create duplicate school cards.
    */
    const userReadStartedAt = performance.now();

    const schoolIds = await User.distinct("schoolId", {
      "parent.phone": parentPhone,
      "status.active": true,
      schoolId: {
        $exists: true,
        $nin: [null, ""],
      },
    });

    databaseTime += performance.now() - userReadStartedAt;

    if (!schoolIds.length) {
      finishTiming(res, apiStartedAt, databaseTime);
console.log("No active parent account found with this phone number");

      return res.status(404).json({
        success: false,
        message: "No active parent account found with this phone number",
        data: {
          hasSingleSchool: false,
          requiresSchoolSelection: false,
          totalSchools: 0,
          schools: [],
        },
      });
    }

    /*
      Step 2:
      Get only the information needed by the school selection screen.
    */
    const schoolReadStartedAt = performance.now();

    const schools = await School.find(
      {
        schoolId: { $in: schoolIds },
        isVerified: true,
      },
      {
        _id: 0,
        schoolId: 1,
        name: 1,
        "address": 1,
        "address": 1,
      },
    )
      .sort({ name: 1 })
      .lean();

    databaseTime += performance.now() - schoolReadStartedAt;

    if (!schools.length) {
      finishTiming(res, apiStartedAt, databaseTime);

      return res.status(404).json({
        success: false,
        message: "No verified school found for this parent account",
        data: {
          hasSingleSchool: false,
          requiresSchoolSelection: false,
          totalSchools: 0,
          schools: [],
        },
      });
    }

    const formattedSchools = schools.map((school) => ({
      schoolId: school.schoolId,
      schoolName: school.name,
      schoolAddress: school.address
    }));

    const hasSingleSchool = formattedSchools.length === 1;

    finishTiming(res, apiStartedAt, databaseTime);
console.log(hasSingleSchool,200);

    return res.status(200).json({
      success: true,
      message: hasSingleSchool
          ? "One school account found"
          : "Multiple school accounts found",
      data: {
        hasSingleSchool,
        requiresSchoolSelection: !hasSingleSchool,
        totalSchools: formattedSchools.length,

        /*
          When only one school exists, the frontend can directly use this ID.
        */
        selectedSchoolId: hasSingleSchool
            ? formattedSchools[0].schoolId
            : null,

        schools: formattedSchools,
      },
    });
  } catch (error) {
    finishTiming(res, apiStartedAt, databaseTime);
console.log(error.message);

    return res.status(500).json({
      success: false,
      message: "Unable to find schools for this parent",
      error: error.message,
    });
  }
};
/*
===============================================================================
7. VERIFY LOGIN OTP
===============================================================================
*/


exports.verifyOTP = async (req, res) => {
  const apiStartedAt = performance.now();
  let databaseTime = 0;

  try {
    const {
      parentPhone,
      deviceId,
      otp,
      fcmToken,
      schoolId,
    } = req.body;

    const cleanSchoolId = cleanText(schoolId);
    const cleanParentPhone = normalizePhone(parentPhone);
    const cleanDeviceId = cleanText(deviceId);
    const cleanOtp = cleanText(otp);
    const cleanFcmToken = cleanText(fcmToken);

    if (
      !cleanSchoolId ||
      !/^[6-9]\d{9}$/.test(cleanParentPhone) ||
      !cleanDeviceId ||
      !/^\d{6}$/.test(cleanOtp) ||
      !cleanFcmToken
    ) {
      finishTiming(res, apiStartedAt, databaseTime);
      return res.status(400).json({
        success: false,
        message:
          "schoolId, valid parentPhone, deviceId, 6-digit otp and fcmToken are required",
      });
    }

    const now = new Date();
    const readStart = performance.now();

    const user = await User.findOne(
      {
        schoolId: cleanSchoolId,
        "parent.phone": cleanParentPhone,
        "status.active": true,
      },
      {
        parentId: 1,
        schoolId: 1,
        parent: 1,
        children: 1,
        otpRequests: {
          $elemMatch: {
            deviceId: cleanDeviceId,
          },
        },
      },
    ).lean();

    databaseTime += performance.now() - readStart;

    if (!user) {
      finishTiming(res, apiStartedAt, databaseTime);
      return res.status(404).json({
        success: false,
        message: "Parent account not found",
      });
    }

    const otpRequest = user.otpRequests?.[0];

    if (!otpRequest) {
      finishTiming(res, apiStartedAt, databaseTime);
      return res.status(400).json({
        success: false,
        message: "OTP was not requested for this device",
      });
    }

    if (!otpRequest.expiresAt || new Date(otpRequest.expiresAt) <= now) {
      const cleanupStart = performance.now();

      await User.updateOne(
        { _id: user._id },
        {
          $pull: {
            otpRequests: { deviceId: cleanDeviceId },
          },
        },
      );

      databaseTime += performance.now() - cleanupStart;
      finishTiming(res, apiStartedAt, databaseTime);

      return res.status(400).json({
        success: false,
        message: "OTP expired. Please request a new OTP.",
      });
    }

    if ((otpRequest.attempts || 0) >= 5) {
      const cleanupStart = performance.now();

      await User.updateOne(
        { _id: user._id },
        {
          $pull: {
            otpRequests: { deviceId: cleanDeviceId },
          },
        },
      );

      databaseTime += performance.now() - cleanupStart;
      finishTiming(res, apiStartedAt, databaseTime);

      return res.status(429).json({
        success: false,
        message: "Too many incorrect attempts. Request a new OTP.",
      });
    }

    if (String(otpRequest.code) !== cleanOtp) {
      const attemptStart = performance.now();

      const attemptResult = await User.findOneAndUpdate(
        {
          _id: user._id,
          otpRequests: {
            $elemMatch: {
              deviceId: cleanDeviceId,
              expiresAt: { $gt: now },
              attempts: { $lt: 5 },
            },
          },
        },
        {
          $inc: {
            "otpRequests.$.attempts": 1,
          },
        },
        {
          new: true,
          projection: {
            otpRequests: {
              $elemMatch: { deviceId: cleanDeviceId },
            },
          },
          lean: true,
        },
      );

      databaseTime += performance.now() - attemptStart;

      const updatedAttempts =
        attemptResult?.otpRequests?.[0]?.attempts ??
        (otpRequest.attempts || 0) + 1;

      finishTiming(res, apiStartedAt, databaseTime);
      return res.status(401).json({
        success: false,
        message: "Invalid OTP",
        attemptsRemaining: Math.max(0, 5 - updatedAttempts),
      });
    }

    const { token, tokenExpiry } = createDeviceSession({
      userId: user._id,
      parentId: user.parentId,
      schoolId: user.schoolId,
      deviceId: cleanDeviceId,
    });

    const saveStartedAt = performance.now();

    /*
    One atomic MongoDB operation:
    - consumes this device's OTP
    - replaces only this device's old session
    - keeps all other device sessions untouched
    - returns the updated record for storage verification
    */
    const updatedUser = await User.findOneAndUpdate(
      {
        _id: user._id,
        otpRequests: {
          $elemMatch: {
            deviceId: cleanDeviceId,
            code: cleanOtp,
            expiresAt: { $gt: now },
            attempts: { $lt: 5 },
          },
        },
      },
      [
        {
          $set: {
            otpRequests: {
              $filter: {
                input: { $ifNull: ["$otpRequests", []] },
                as: "request",
                cond: {
                  $ne: ["$$request.deviceId", cleanDeviceId],
                },
              },
            },
            devices: {
              $concatArrays: [
                {
                  $filter: {
                    input: { $ifNull: ["$devices", []] },
                    as: "device",
                    cond: {
                      $ne: ["$$device.deviceId", cleanDeviceId],
                    },
                  },
                },
                [
                  {
                    deviceId: cleanDeviceId,
                    fcmToken: cleanFcmToken,
                    token,
                    tokenExpiry,
                    lastLoginAt: now,
                  },
                ],
              ],
            },
          },
        },
      ],
      {
        new: true,
        updatePipeline: true,
        lean: true,
        projection: {
          parentId: 1,
          schoolId: 1,
          parent: 1,
          children: 1,
          devices: 1,
        },
      },
    );

    databaseTime += performance.now() - saveStartedAt;

    if (!updatedUser) {
      finishTiming(res, apiStartedAt, databaseTime);
      return res.status(400).json({
        success: false,
        message: "OTP is invalid, expired, or already used",
      });
    }

    const storedDevice = updatedUser.devices?.find(
      (device) => String(device.deviceId) === cleanDeviceId,
    );

    if (
      !storedDevice ||
      storedDevice.token !== token ||
      !storedDevice.tokenExpiry
    ) {
      throw new Error(
        "Token was generated but was not stored against this device in MongoDB",
      );
    }

    finishTiming(res, apiStartedAt, databaseTime);
    return res.status(200).json({
  success: true,
  message: "OTP verified and login successful",

  token,
  tokenExpiry,
  loginRole: "parent",
  sessionStored: true,

  data: {
    parentId: updatedUser.parentId,
    schoolId: updatedUser.schoolId,
    parent: updatedUser.parent,
    children: updatedUser.children,
    deviceId: cleanDeviceId,
  },
});
  } catch (error) {
    console.error("VERIFY OTP ERROR:", error);
    finishTiming(res, apiStartedAt, databaseTime);

    return res.status(500).json({
      success: false,
      message: "Unable to verify OTP",
      error: error.message,
    });
  }
};

exports.resendOTP = async (req, res) => {
  // Same optimized workflow and response contract as sendOTP.
  return exports.sendOTP(req, res);
};

/*
===============================================================================
9. UPDATE STUDENT
===============================================================================
*/
exports.updateStudent = async (req, res) => {
  const apiStartedAt = performance.now();
  let databaseTime = 0;

  try {
    const { parentId } = req.params;
    const { schoolId } = req.user;
    const { parent, child } = req.body;

    const setData = {};

    if (parent?.name !== undefined) setData["parent.name"] = parent.name;
    if (parent?.phone !== undefined) setData["parent.phone"] = parent.phone;

    if (Array.isArray(child)) {
      setData.children = child.map((item) => ({
        _id:
          item._id && mongoose.Types.ObjectId.isValid(item._id)
            ? item._id
            : new mongoose.Types.ObjectId(),
        studentId:
          item.studentId || `STU-${Date.now().toString().slice(-6)}`,
        name: item.studentName || item.name,
        class: item.class || "N/A",
        section: item.section || "-",
        rollNumber: item.rollNumber || "-",
        busNumber: item.busNumber || "",
        pickupPointId: item.pickupPointId ?? null,
        status: item.status || { active: true },
      }));
    }

    if (!Object.keys(setData).length) {
      finishTiming(res, apiStartedAt, databaseTime);
      return res.status(400).json({
        success: false,
        message: "No update data provided",
      });
    }

    const dbStart = performance.now();

    /*
    Preserve the original behaviour:
    parentId route parameter was previously matched against MongoDB _id.
    */
    const user = await User.findOneAndUpdate(
      {
        _id: parentId,
        schoolId,
      },
      {
        $set: setData,
      },
      {
        new: true,
        runValidators: true,
        lean: true,
      },
    );

    databaseTime += performance.now() - dbStart;

    if (!user) {
      finishTiming(res, apiStartedAt, databaseTime);
      return res.status(404).json({
        success: false,
        message: "Parent profile not found",
      });
    }

    finishTiming(res, apiStartedAt, databaseTime);
    return res.status(200).json({
      success: true,
      message: "Parent workspace node and nested student array updated completely!",
      data: user,
    });
  } catch (err) {
    finishTiming(res, apiStartedAt, databaseTime);
    return res.status(500).json({
      success: false,
      error: err.message,
    });
  }
};

/*
===============================================================================
10. DELETE PARENT
===============================================================================
*/
exports.deleteParent = async (req, res) => {
  try {
    const { parentId } = req.params;
    const { schoolId } = req.user;

    /*
    =====================================
    REQUIRED FIELD VALIDATION
    =====================================
    */

    if (!schoolId || !parentId) {
      return res.status(400).json({
        success: false,
        code: "REQUIRED_FIELDS_MISSING",
        message: "School ID and Parent ID are required",
      });
    }

    const cleanSchoolId = String(schoolId).trim();
    const cleanParentId = String(parentId).trim();

    /*
    =====================================
    FIND PARENT FIRST
    =====================================
    */

    const parent = await User.findOne({
      parentId: cleanParentId,
      schoolId: cleanSchoolId,
    });

    if (!parent) {
      return res.status(404).json({
        success: false,
        code: "PARENT_NOT_FOUND",
        message: "Parent profile not found under this school",
      });
    }

    /*
    =====================================
    GET ALL STUDENT IDS OF THIS PARENT
    =====================================
    */

    const studentIds = parent.children.map((child) =>
      String(child.studentId).trim(),
    );

    /*
    =====================================
    FIND AFFECTED PICKUP DOCUMENTS

    Redis update के लिए busNumber पहले
    collect कर रहे हैं।
    =====================================
    */

    const affectedPickupDocs = await PickupPoint.find({
      schoolId: cleanSchoolId,
      "pickupPoints.assignedStudents.parentId": cleanParentId,
    }).select("busNumber");

    const affectedBusNumbers = [
      ...new Set(
        affectedPickupDocs.map((doc) =>
          String(doc.busNumber).trim(),
        ),
      ),
    ];

    /*
    =====================================
    REMOVE PARENT'S ALL STUDENTS FROM
    EVERY PICKUP POINT OF THIS SCHOOL
    =====================================
    */

    const pickupUpdateResult = await PickupPoint.updateMany(
      {
        schoolId: cleanSchoolId,
        "pickupPoints.assignedStudents.parentId":
          cleanParentId,
      },
      {
        $pull: {
          "pickupPoints.$[].assignedStudents": {
            parentId: cleanParentId,
          },
        },
      },
    );

    /*
    =====================================
    DELETE PARENT DOCUMENT
    =====================================
    */

    const deleteResult = await User.deleteOne({
      parentId: cleanParentId,
      schoolId: cleanSchoolId,
    });

    if (deleteResult.deletedCount === 0) {
      return res.status(404).json({
        success: false,
        code: "PARENT_DELETE_FAILED",
        message: "Parent was not deleted",
      });
    }

    /*
    =====================================
    REFRESH REDIS FOR AFFECTED BUSES
    =====================================
    */

    const redisSyncErrors = [];

    for (const affectedBusNumber of affectedBusNumbers) {
      try {
        const updatedPickupDoc =
          await PickupPoint.findOne({
            schoolId: cleanSchoolId,
            busNumber: affectedBusNumber,
          });

        const redisKey = `pickup_points:${cleanSchoolId}:${affectedBusNumber}`;

        if (updatedPickupDoc) {
          await redisClient.set(
            redisKey,
            JSON.stringify(
              updatedPickupDoc.pickupPoints,
            ),
          );
        } else {
          await redisClient.del(redisKey);
        }
      } catch (redisError) {
        console.error(
          `Redis sync failed for bus ${affectedBusNumber}:`,
          redisError,
        );

        redisSyncErrors.push(affectedBusNumber);
      }
    }

    /*
    =====================================
    SUCCESS RESPONSE
    =====================================
    */

    return res.status(200).json({
      success: true,
      code: "PARENT_DELETED_SUCCESSFULLY",
      message:
        "Parent, all nested children and their pickup-point assignments deleted successfully",

      deletedData: {
        schoolId: cleanSchoolId,
        parentId: cleanParentId,
        deletedStudentIds: studentIds,
        affectedBusNumbers,
        pickupDocumentsModified:
          pickupUpdateResult.modifiedCount,
      },

      redisSync:
        redisSyncErrors.length === 0
          ? {
              success: true,
              message:
                "All affected Redis records updated",
            }
          : {
              success: false,
              message:
                "Parent was deleted, but Redis sync failed for some buses",
              failedBusNumbers: redisSyncErrors,
            },
    });
  } catch (error) {
    console.error(
      "Error executing parent deletion:",
      error,
    );

    return res.status(500).json({
      success: false,
      code: "DELETE_PARENT_SERVER_ERROR",
      message:
        "Server error during parent deletion process",
      error:
        process.env.NODE_ENV === "development"
          ? error.message
          : undefined,
    });
  }
};

exports.deleteChild = async (req, res) => {
  try {
    const { parentId, childId } = req.params;
    const { schoolId } = req.user;

    /*
    =====================================
    REQUIRED FIELD VALIDATION
    =====================================
    */

    if (!schoolId || !parentId || !childId) {
      return res.status(400).json({
        success: false,
        code: "REQUIRED_FIELDS_MISSING",
        message:
          "School ID, Parent ID and Student ID are required",
      });
    }

    const cleanSchoolId = String(schoolId).trim();
    const cleanParentId = String(parentId).trim();
    const cleanStudentId = String(childId).trim();

    /*
    =====================================
    FIND PARENT AND STUDENT
    =====================================
    */

    const parent = await User.findOne({
      parentId: cleanParentId,
      schoolId: cleanSchoolId,
    });

    if (!parent) {
      return res.status(404).json({
        success: false,
        code: "PARENT_NOT_FOUND",
        message: "Parent not found under this school",
      });
    }

    const child = parent.children.find(
      (item) =>
        String(item.studentId).trim() ===
        cleanStudentId,
    );

    if (!child) {
      return res.status(404).json({
        success: false,
        code: "STUDENT_NOT_FOUND",
        message:
          "Student not found inside the parent's children array",
      });
    }

    /*
    =====================================
    SAVE CURRENT ASSIGNMENT INFORMATION

    यह response में admin को मिलेगा।
    =====================================
    */

    const existingAssignment = {
      schoolId: cleanSchoolId,
      parentId: cleanParentId,
      studentId: cleanStudentId,
      busNumber: child.busNumber || null,
      pickupPointId: child.pickupPointId || null,
    };

    /*
    =====================================
    FIND ALL AFFECTED PICKUP DOCUMENTS
    =====================================
    */

    const affectedPickupDocs = await PickupPoint.find({
      schoolId: cleanSchoolId,

      pickupPoints: {
        $elemMatch: {
          assignedStudents: {
            $elemMatch: {
              parentId: cleanParentId,
              studentId: cleanStudentId,
            },
          },
        },
      },
    }).select("busNumber");

    const affectedBusNumbers = [
      ...new Set(
        affectedPickupDocs.map((doc) =>
          String(doc.busNumber).trim(),
        ),
      ),
    ];

    /*
    =====================================
    REMOVE STUDENT FROM EVERY PICKUP POINT
    =====================================
    */

    const pickupUpdateResult = await PickupPoint.updateMany(
      {
        schoolId: cleanSchoolId,

        pickupPoints: {
          $elemMatch: {
            assignedStudents: {
              $elemMatch: {
                parentId: cleanParentId,
                studentId: cleanStudentId,
              },
            },
          },
        },
      },
      {
        $pull: {
          "pickupPoints.$[].assignedStudents": {
            parentId: cleanParentId,
            studentId: cleanStudentId,
          },
        },
      },
    );

    /*
    =====================================
    REMOVE STUDENT FROM PARENT CHILDREN
    ARRAY USING DIRECT MONGODB QUERY
    =====================================
    */

    const childDeleteResult = await User.updateOne(
      {
        schoolId: cleanSchoolId,
        parentId: cleanParentId,
        "children.studentId": cleanStudentId,
      },
      {
        $pull: {
          children: {
            studentId: cleanStudentId,
          },
        },
      },
    );

    if (childDeleteResult.modifiedCount === 0) {
      return res.status(404).json({
        success: false,
        code: "STUDENT_DELETE_FAILED",
        message:
          "Student record could not be removed from the parent document",
      });
    }

    /*
    =====================================
    GET UPDATED PARENT DOCUMENT
    =====================================
    */

    const updatedParent = await User.findOne({
      schoolId: cleanSchoolId,
      parentId: cleanParentId,
    });

    /*
    =====================================
    REFRESH REDIS FOR AFFECTED BUSES
    =====================================
    */

    const redisSyncErrors = [];

    for (const affectedBusNumber of affectedBusNumbers) {
      try {
        const updatedPickupDoc =
          await PickupPoint.findOne({
            schoolId: cleanSchoolId,
            busNumber: affectedBusNumber,
          });

        const redisKey = `pickup_points:${cleanSchoolId}:${affectedBusNumber}`;

        if (updatedPickupDoc) {
          await redisClient.set(
            redisKey,
            JSON.stringify(
              updatedPickupDoc.pickupPoints,
            ),
          );
        } else {
          await redisClient.del(redisKey);
        }
      } catch (redisError) {
        console.error(
          `Redis sync failed for bus ${affectedBusNumber}:`,
          redisError,
        );

        redisSyncErrors.push(affectedBusNumber);
      }
    }

    /*
    =====================================
    SUCCESS RESPONSE
    =====================================
    */

    return res.status(200).json({
      success: true,
      code: "STUDENT_DELETED_SUCCESSFULLY",
      message:
        "Student and pickup-point assignment deleted successfully",

      deletedStudent: existingAssignment,

      pickupRemoval: {
        affectedBusNumbers,
        pickupDocumentsModified:
          pickupUpdateResult.modifiedCount,
      },

      redisSync:
        redisSyncErrors.length === 0
          ? {
              success: true,
              message:
                "All affected Redis records updated",
            }
          : {
              success: false,
              message:
                "Student was deleted, but Redis sync failed for some buses",
              failedBusNumbers: redisSyncErrors,
            },

      data: updatedParent,
    });
  } catch (error) {
    console.error(
      "Error executing child deletion:",
      error,
    );

    return res.status(500).json({
      success: false,
      code: "DELETE_STUDENT_SERVER_ERROR",
      message:
        "Server error during student deletion process",
      error:
        process.env.NODE_ENV === "development"
          ? error.message
          : undefined,
    });
  }
};
/*================================================================================
9. SAVE FCM TOKEN
================================================================================
*/

/*
================================================================================
SAVE OR UPDATE DEVICE FCM TOKEN
================================================================================
*/

exports.saveFcmToken = async (req, res) => {
  const apiStartedAt = performance.now();
  let databaseTime = 0;

  try {
    const schoolId = req.user?.schoolId;
    const parentId = cleanText(req.user?.parentId);
    const deviceId = cleanText(req.user?.deviceId);
    const fcmToken = cleanText(req.body.fcmToken);

    if (!schoolId || !parentId || !deviceId || !fcmToken) {
      finishTiming(res, apiStartedAt, databaseTime);
      return res.status(400).json({
        success: false,
        message: "Valid parent session and fcmToken are required",
      });
    }

    const dbStart = performance.now();

    const user = await User.findOneAndUpdate(
      {
        parentId,
        schoolId,
        "status.active": true,
        devices: {
          $elemMatch: {
            deviceId,
            token: { $nin: [null, ""] },
            tokenExpiry: { $gt: new Date() },
          },
        },
      },
      {
        $set: {
          "devices.$.fcmToken": fcmToken,
        },
      },
      {
        new: true,
        lean: true,
        projection: {
          _id: 0,
          parentId: 1,
        },
      },
    );

    databaseTime += performance.now() - dbStart;

    if (!user) {
      finishTiming(res, apiStartedAt, databaseTime);
      return res.status(404).json({
        success: false,
        message: "Active device session not found",
      });
    }

    finishTiming(res, apiStartedAt, databaseTime);
    return res.status(200).json({
      success: true,
      message: "FCM token updated for the current device",
      data: {
        parentId,
        deviceId,
      },
    });
  } catch (error) {
    finishTiming(res, apiStartedAt, databaseTime);
    return res.status(500).json({
      success: false,
      message: "Unable to save FCM token",
      error: error.message,
    });
  }
};

exports.logoutDevice = async (req, res) => {
  const apiStartedAt = performance.now();
  let databaseTime = 0;

  try {
    const schoolId = req.user?.schoolId;
    const isParentSession = req.user?.role === "parent";

    /*
    Parent route: always use IDs from the verified JWT.
    Authority route: use IDs supplied in the request body.
    */
    const parentId = isParentSession
      ? cleanText(req.user?.parentId)
      : cleanText(req.body.parentId);

    const deviceId = isParentSession
      ? cleanText(req.user?.deviceId)
      : cleanText(req.body.deviceId);

    if (!schoolId || !parentId || !deviceId) {
      finishTiming(res, apiStartedAt, databaseTime);
      return res.status(400).json({
        success: false,
        message: "parentId and deviceId are required",
      });
    }

    const dbStart = performance.now();

    const result = await User.updateOne(
      {
        parentId,
        schoolId,
        "devices.deviceId": deviceId,
      },
      {
        $pull: {
          devices: { deviceId },
        },
      },
    );

    databaseTime += performance.now() - dbStart;

    if (!result.matchedCount) {
      finishTiming(res, apiStartedAt, databaseTime);
      return res.status(404).json({
        success: false,
        message: "This device session was not found",
      });
    }

    finishTiming(res, apiStartedAt, databaseTime);
    return res.status(200).json({
      success: true,
      message: "Selected device logged out successfully",
      data: {
        parentId,
        deviceId,
        deviceRemoved: result.modifiedCount > 0,
      },
    });
  } catch (error) {
    finishTiming(res, apiStartedAt, databaseTime);
    return res.status(500).json({
      success: false,
      message: "Unable to logout device",
      error: error.message,
    });
  }
};

exports.getLoggedInDevices = async (req, res) => {
  try {
    const schoolId = req.user?.schoolId;
    const isParentSession = req.user?.role === "parent";

    const parentId = isParentSession
      ? cleanText(req.user?.parentId)
      : cleanText(req.params.parentId);

    if (!schoolId || !parentId) {
      return res.status(400).json({
        success: false,
        message: "parentId is required",
      });
    }

    const parent = await User.findOne(
      {
        schoolId,
        parentId,
        "status.active": true,
      },
      {
        _id: 0,
        parentId: 1,
        devices: 1,
      },
    ).lean();

    if (!parent) {
      return res.status(404).json({
        success: false,
        message: "Parent account not found",
      });
    }

    const now = new Date();

    const devices = (parent.devices || []).map((device) => ({
      deviceId: device.deviceId,
      lastLoginAt: device.lastLoginAt || null,
      tokenExpiry: device.tokenExpiry || null,
      active:
        Boolean(device.token) &&
        Boolean(device.tokenExpiry) &&
        new Date(device.tokenExpiry) > now,
    }));

    return res.status(200).json({
      success: true,
      data: {
        parentId: parent.parentId,
        devices,
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Unable to fetch logged-in devices",
      error: error.message,
    });
  }
};

exports.getParentById = async (req, res) => {
  const apiStartedAt = performance.now();
  let databaseTime = 0;

  try {
    const { parentId } = req.params;
    const { schoolId } = req.user;
    const dbStart = performance.now();

    const user = await User.findOne(
      { parentId, schoolId },
      { otpRequests: 0, "devices.token": 0 },
    ).lean();

    databaseTime += performance.now() - dbStart;

    if (!user) {
      finishTiming(res, apiStartedAt, databaseTime);
      return res.status(404).json({
        success: false,
        message: "Parent not found",
      });
    }

    finishTiming(res, apiStartedAt, databaseTime);
    return res.status(200).json({
      success: true,
      data: user,
    });
  } catch (err) {
    finishTiming(res, apiStartedAt, databaseTime);
    return res.status(500).json({
      success: false,
      error: err.message,
    });
  }
};

/*
===============================================================================
15. GET PARENTS PAGINATION
===============================================================================
*/
exports.getParentsPagination = async (req, res) => {
  const apiStartedAt = performance.now();
  let databaseTime = 0;

  try {
    const { schoolId } = req.user;

    const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
    const limit = Math.min(
      100,
      Math.max(1, Number.parseInt(req.query.limit, 10) || 10),
    );
    const search = cleanText(req.query.search);
    const skip = (page - 1) * limit;

    const match = { schoolId };

    if (search) {
      const escapedSearch = search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

      match.$or = [
        { "parent.name": { $regex: escapedSearch, $options: "i" } },
        { "parent.phone": { $regex: escapedSearch, $options: "i" } },
        { parentId: { $regex: escapedSearch, $options: "i" } },
      ];
    }

    const dbStart = performance.now();

    /*
    One database round trip instead of:
    1. countDocuments()
    2. find().sort().skip().limit()
    */
    const [result] = await User.aggregate([
      { $match: match },
      {
        $facet: {
          metadata: [{ $count: "totalRecords" }],
          data: [
            { $sort: { createdAt: -1, _id: -1 } },
            { $skip: skip },
            { $limit: limit },
          ],
        },
      },
      {
        $project: {
          data: 1,
          totalRecords: {
            $ifNull: [{ $arrayElemAt: ["$metadata.totalRecords", 0] }, 0],
          },
        },
      },
    ]).allowDiskUse(false);

    databaseTime += performance.now() - dbStart;

    const totalRecords = result?.totalRecords || 0;

    finishTiming(res, apiStartedAt, databaseTime);
    return res.status(200).json({
      success: true,
      pagination: {
        totalRecords,
        currentPage: page,
        totalPages: Math.ceil(totalRecords / limit),
        limit,
      },
      data: result?.data || [],
    });
  } catch (err) {
    finishTiming(res, apiStartedAt, databaseTime);
    return res.status(500).json({
      success: false,
      error: err.message,
    });
  }
};

/*
===============================================================================
16. GET SINGLE CHILD
===============================================================================
*/
exports.getChildById = async (req, res) => {
  const apiStartedAt = performance.now();
  let databaseTime = 0;

  try {
    const { parentId, childId } = req.params;
    const { schoolId } = req.user;
    const dbStart = performance.now();

    /*
    Fetch only the matching child instead of loading the complete parent and
    searching the children array in Node.js.
    */
    const [result] = await User.aggregate([
      {
        $match: {
          parentId,
          schoolId,
        },
      },
      { $unwind: "$children" },
      {
        $match: {
          $or: [
            { "children.childId": childId },
            { "children.studentId": childId },
            ...(mongoose.Types.ObjectId.isValid(childId)
              ? [{ "children._id": new mongoose.Types.ObjectId(childId) }]
              : []),
          ],
        },
      },
      {
        $replaceRoot: {
          newRoot: "$children",
        },
      },
      { $limit: 1 },
    ]);

    databaseTime += performance.now() - dbStart;

    if (!result) {
      finishTiming(res, apiStartedAt, databaseTime);
      return res.status(404).json({
        success: false,
        message: "Child not found",
      });
    }

    finishTiming(res, apiStartedAt, databaseTime);
    return res.status(200).json({
      success: true,
      data: result,
    });
  } catch (err) {
    finishTiming(res, apiStartedAt, databaseTime);
    return res.status(500).json({
      success: false,
      error: err.message,
    });
  }
};