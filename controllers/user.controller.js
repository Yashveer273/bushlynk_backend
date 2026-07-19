const generateId = require("../utils/generateId");
const mongoose = require("mongoose");
const jwt = require("jsonwebtoken");
const { performance } = require("node:perf_hooks");

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

const getRegisterOtpDeviceId = (phone) =>
  `REGISTER:${phone}`;

const getRegisterTokenSecret = () => {
  const secret =
    process.env.REGISTER_OTP_SECRET ||
    process.env.JWT_SECRET;

  if (!secret) {
    throw new Error(
      "REGISTER_OTP_SECRET or JWT_SECRET is missing",
    );
  }

  return secret;
};

/*
===============================================================================
1. SEND REGISTER OTP / 2. VERIFY REGISTER OTP / 3. CREATE STUDENT
===============================================================================
*/
exports.sendRegisterOTP = async (req, res) => {
  const apiStartedAt = performance.now();
  let databaseTime = 0;

  try {
    const { schoolId } = req.user;
    const parentPhone = normalizePhone(req.body.parentPhone);

    if (!schoolId || !/^[6-9]\d{9}$/.test(parentPhone)) {
      finishTiming(res, apiStartedAt, databaseTime);

      return res.status(400).json({
        success: false,
        message:
          "Valid schoolId and 10-digit parentPhone are required",
      });
    }

    const registerDeviceId =
      getRegisterOtpDeviceId(parentPhone);

    const readStartedAt = performance.now();

    const [schoolExists, registeredParent] =
      await Promise.all([
        School.exists({
          schoolId,
        }),

        User.exists({
          schoolId,
          "parent.phone": parentPhone,
          "children.0": {
            $exists: true,
          },
        }),
      ]);

    databaseTime +=
      performance.now() - readStartedAt;

    if (!schoolExists) {
      finishTiming(res, apiStartedAt, databaseTime);

      return res.status(404).json({
        success: false,
        message: "School not found",
      });
    }

    if (registeredParent) {
      finishTiming(res, apiStartedAt, databaseTime);

      return res.status(409).json({
        success: false,
        message:
          "This parent phone is already registered",
      });
    }

    const otp = createOtp();
    const expiresAt = new Date(
      Date.now() + 10 * 60 * 1000,
    );

    const writeStartedAt = performance.now();

    /*
    Existing temporary parent:
    Replace only its registration OTP.
    */
    let result = await User.updateOne(
      {
        schoolId,
        "parent.phone": parentPhone,
        "children.0": {
          $exists: false,
        },
      },
      [
        {
          $set: {
            otpRequests: {
              $concatArrays: [
                {
                  $filter: {
                    input: {
                      $ifNull: [
                        "$otpRequests",
                        [],
                      ],
                    },
                    as: "request",
                    cond: {
                      $ne: [
                        "$$request.deviceId",
                        registerDeviceId,
                      ],
                    },
                  },
                },
                [
                  {
                    deviceId:
                      registerDeviceId,
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
    );

    /*
    No temporary parent exists:
    Create only a temporary record containing zero children.
    */
    if (result.matchedCount === 0) {
      try {
        await User.create({
          parentId: generateId("PAR"),
          schoolId,
          parent: {
            name: "TEMP",
            phone: parentPhone,
          },
          children: [],
          otpRequests: [
            {
              deviceId:
                registerDeviceId,
              code: otp,
              expiresAt,
              attempts: 0,
            },
          ],
          devices: [],
          status: {
            active: true,
          },
        });
      } catch (error) {
        /*
        Handles two simultaneous requests safely.
        */
        if (error?.code !== 11000) {
          throw error;
        }

        result = await User.updateOne(
          {
            schoolId,
            "parent.phone": parentPhone,
            "children.0": {
              $exists: false,
            },
          },
          [
            {
              $set: {
                otpRequests: [
                  {
                    deviceId:
                      registerDeviceId,
                    code: otp,
                    expiresAt,
                    attempts: 0,
                  },
                ],
              },
            },
          ],
        );

        if (result.matchedCount === 0) {
          finishTiming(
            res,
            apiStartedAt,
            databaseTime,
          );

          return res.status(409).json({
            success: false,
            message:
              "This parent phone is already registered",
          });
        }
      }
    }

    databaseTime +=
      performance.now() - writeStartedAt;

    /*
    Replace console OTP with your SMS provider.
    */
    console.log(
      `Register OTP for ${parentPhone}: ${otp}`,
    );

    finishTiming(res, apiStartedAt, databaseTime);

    return res.status(200).json({
      success: true,
      message: "Registration OTP sent successfully",

      /*
      Remove otp from production response after SMS integration.
      */
      data: {
        otp,
        expiresInSeconds: 600,
      },
    });
  } catch (error) {
    finishTiming(res, apiStartedAt, databaseTime);

    return res.status(500).json({
      success: false,
      message:
        "Unable to send registration OTP",
      error: error.message,
    });
  }
};

/*
===============================================================================
2. VERIFY REGISTER OTP
===============================================================================

Purpose:
- Verify the OTP.
- Consume the OTP so it cannot be reused.
- Return a short-lived registrationToken.
- This token is required by createStudent.
*/
exports.verifyRegisterOTP = async (req, res) => {
  const apiStartedAt = performance.now();
  let databaseTime = 0;

  try {
    const { schoolId } = req.user;
    const parentPhone = normalizePhone(
      req.body.parentPhone,
    );
    const otp = String(req.body.otp || "").trim();

    if (
      !schoolId ||
      !/^[6-9]\d{9}$/.test(parentPhone) ||
      !/^\d{6}$/.test(otp)
    ) {
      finishTiming(res, apiStartedAt, databaseTime);

      return res.status(400).json({
        success: false,
        message:
          "schoolId, valid parentPhone and 6-digit otp are required",
      });
    }

    const registerDeviceId =
      getRegisterOtpDeviceId(parentPhone);
    const now = new Date();

    const readStartedAt = performance.now();

    const user = await User.findOne(
      {
        schoolId,
        "parent.phone": parentPhone,
        "children.0": {
          $exists: false,
        },
      },
      {
        _id: 1,
        parentId: 1,
        otpRequests: {
          $elemMatch: {
            deviceId:
              registerDeviceId,
          },
        },
      },
    ).lean();

    databaseTime +=
      performance.now() - readStartedAt;

    if (!user) {
      finishTiming(res, apiStartedAt, databaseTime);

      return res.status(404).json({
        success: false,
        message:
          "Registration request not found",
      });
    }

    const otpRequest =
      user.otpRequests?.[0];

    if (!otpRequest) {
      finishTiming(res, apiStartedAt, databaseTime);

      return res.status(400).json({
        success: false,
        message:
          "Registration OTP was not requested",
      });
    }

    if (
      !otpRequest.expiresAt ||
      new Date(otpRequest.expiresAt) <= now
    ) {
      const cleanupStartedAt =
        performance.now();

      await User.updateOne(
        {
          _id: user._id,
        },
        {
          $pull: {
            otpRequests: {
              deviceId:
                registerDeviceId,
            },
          },
        },
      );

      databaseTime +=
        performance.now() -
        cleanupStartedAt;

      finishTiming(res, apiStartedAt, databaseTime);

      return res.status(400).json({
        success: false,
        message:
          "Registration OTP expired",
      });
    }

    if ((otpRequest.attempts || 0) >= 5) {
      finishTiming(res, apiStartedAt, databaseTime);

      return res.status(429).json({
        success: false,
        message:
          "Too many incorrect OTP attempts",
      });
    }

    if (
      String(otpRequest.code) !== otp
    ) {
      const attemptStartedAt =
        performance.now();

      const attemptResult =
        await User.findOneAndUpdate(
          {
            _id: user._id,
            otpRequests: {
              $elemMatch: {
                deviceId:
                  registerDeviceId,
                attempts: {
                  $lt: 5,
                },
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
                $elemMatch: {
                  deviceId:
                    registerDeviceId,
                },
              },
            },
            lean: true,
          },
        );

      databaseTime +=
        performance.now() -
        attemptStartedAt;

      const updatedAttempts =
        attemptResult
          ?.otpRequests?.[0]
          ?.attempts ||
        (otpRequest.attempts || 0) + 1;

      finishTiming(res, apiStartedAt, databaseTime);

      return res.status(401).json({
        success: false,
        message: "Invalid OTP",
        attemptsRemaining:
          Math.max(
            0,
            5 - updatedAttempts,
          ),
      });
    }

    /*
    Consume the exact OTP atomically.
    */
    const consumeStartedAt =
      performance.now();

    const consumeResult =
      await User.updateOne(
        {
          _id: user._id,
          otpRequests: {
            $elemMatch: {
              deviceId:
                registerDeviceId,
              code: otp,
              expiresAt: {
                $gt: now,
              },
              attempts: {
                $lt: 5,
              },
            },
          },
        },
        {
          $pull: {
            otpRequests: {
              deviceId:
                registerDeviceId,
            },
          },
        },
      );

    databaseTime +=
      performance.now() -
      consumeStartedAt;

    if (consumeResult.modifiedCount === 0) {
      finishTiming(res, apiStartedAt, databaseTime);

      return res.status(400).json({
        success: false,
        message:
          "OTP is invalid, expired or already used",
      });
    }

    /*
    The token is tied to:
    - schoolId
    - parentPhone
    - purpose
    - temporary parent record

    It expires after 10 minutes.
    */
    const registrationToken = jwt.sign(
      {
        purpose:
          "STUDENT_REGISTRATION",
        schoolId,
        parentPhone,
        parentRecordId:
          String(user._id),
      },
      getRegisterTokenSecret(),
      {
        expiresIn: "10m",
      },
    );

    finishTiming(res, apiStartedAt, databaseTime);

    return res.status(200).json({
      success: true,
      verified: true,
      message:
        "Registration OTP verified successfully",
      data: {
        registrationToken,
        expiresInSeconds: 600,
      },
    });
  } catch (error) {
    finishTiming(res, apiStartedAt, databaseTime);

    return res.status(500).json({
      success: false,
      message:
        "Unable to verify registration OTP",
      error: error.message,
    });
  }
};

/*
===============================================================================
3. CREATE STUDENT
===============================================================================

Required request:

Headers:
Authorization: Bearer SCHOOL_TOKEN

Body:
{
  "registrationToken": "TOKEN_FROM_VERIFY_REGISTER_OTP",
  "parent": {
    "name": "Rahul Sharma",
    "phone": "9876543210"
  },
  "child": [
    {
      "studentId": "STD001",
      "name": "Aryan Sharma",
      "class": "5",
      "section": "A",
      "rollNumber": "12"
    }
  ]
}
*/
exports.createStudent = async (req, res) => {
  const apiStartedAt = performance.now();
  let databaseTime = 0;

  try {
    const { schoolId } = req.user;
    const {
      registrationToken,
      parent,
      child,
    } = req.body;

    const parentPhone = normalizePhone(
      parent?.phone,
    );

    const missingFields = [];

    if (!schoolId) {
      missingFields.push("schoolId");
    }

    if (!registrationToken) {
      missingFields.push(
        "registrationToken",
      );
    }

    if (!parent?.name) {
      missingFields.push("parent.name");
    }

    if (
      !/^[6-9]\d{9}$/.test(parentPhone)
    ) {
      missingFields.push(
        "valid parent.phone",
      );
    }

    if (
      !Array.isArray(child) ||
      child.length === 0
    ) {
      missingFields.push(
        "child array",
      );
    } else {
      child.forEach(
        (item, index) => {
          if (!item.studentId) {
            missingFields.push(
              `child[${index}].studentId`,
            );
          }

          if (!item.name) {
            missingFields.push(
              `child[${index}].name`,
            );
          }

          if (!item.class) {
            missingFields.push(
              `child[${index}].class`,
            );
          }

          if (!item.section) {
            missingFields.push(
              `child[${index}].section`,
            );
          }

          if (!item.rollNumber) {
            missingFields.push(
              `child[${index}].rollNumber`,
            );
          }
        },
      );
    }

    if (missingFields.length) {
      finishTiming(res, apiStartedAt, databaseTime);

      return res.status(400).json({
        success: false,
        message:
          "Required fields missing",
        missingFields,
      });
    }

    let verifiedRegistration;

    try {
      verifiedRegistration =
        jwt.verify(
          registrationToken,
          getRegisterTokenSecret(),
        );
    } catch (error) {
      finishTiming(res, apiStartedAt, databaseTime);

      return res.status(401).json({
        success: false,
        message:
          error.name ===
          "TokenExpiredError"
            ? "Registration verification token expired. Verify OTP again."
            : "Invalid registration verification token",
      });
    }

    if (
      verifiedRegistration.purpose !==
        "STUDENT_REGISTRATION" ||
      verifiedRegistration.schoolId !==
        schoolId ||
      normalizePhone(
        verifiedRegistration.parentPhone,
      ) !== parentPhone
    ) {
      finishTiming(res, apiStartedAt, databaseTime);

      return res.status(403).json({
        success: false,
        message:
          "Registration token does not match this school or parent phone",
      });
    }

    const childrenDataArray =
      child.map((item) => ({
        studentId: item.studentId,
        name: item.name,
        class: item.class,
        section: item.section,
        rollNumber:
          item.rollNumber,
        busNumber:
          item.busNumber || "",
        pickupPointId:
          item.pickupPointId ??
          null,
        status: {
          active: true,
        },
      }));

    const studentIds =
      childrenDataArray.map(
        (item) =>
          String(item.studentId),
      );

    if (
      new Set(studentIds).size !==
      studentIds.length
    ) {
      finishTiming(res, apiStartedAt, databaseTime);

      return res.status(409).json({
        success: false,
        message:
          "Duplicate studentId exists in the submitted child array",
      });
    }

    const writeStartedAt =
      performance.now();

    /*
    Only the same temporary parent record created during OTP
    request can be converted into the real parent account.
    */
    const createdParent =
      await User.findOneAndUpdate(
        {
          _id:
            verifiedRegistration
              .parentRecordId,
          schoolId,
          "parent.phone":
            parentPhone,
          "children.0": {
            $exists: false,
          },
        },
        {
          $set: {
            "parent.name":
              parent.name,
            "parent.phone":
              parentPhone,
            children:
              childrenDataArray,
            otpRequests: [],
            status: {
              active: true,
            },
          },
        },
        {
          new: true,
          runValidators: true,
          lean: true,
        },
      );

    databaseTime +=
      performance.now() -
      writeStartedAt;

    if (!createdParent) {
      finishTiming(res, apiStartedAt, databaseTime);

      return res.status(409).json({
        success: false,
        message:
          "Student account was already created or the registration request is no longer valid",
      });
    }

    finishTiming(res, apiStartedAt, databaseTime);

    return res.status(201).json({
      success: true,
      message:
        "Parent and student account created successfully",
      data: createdParent,
    });
  } catch (error) {
    finishTiming(res, apiStartedAt, databaseTime);

    if (error?.code === 11000) {
      return res.status(409).json({
        success: false,
        message:
          "Parent phone, parent ID or student record already exists",
      });
    }

    return res.status(500).json({
      success: false,
      message:
        "Unable to create student account",
      error: error.message,
    });
  }
};


/*
===============================================================================
4. ADD CHILD
===============================================================================
*/
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
    const { parentPhone, deviceId } = req.body;
    const { schoolId } = req.user;

    if (!schoolId || !parentPhone || !deviceId) {
      finishTiming(res, apiStartedAt, databaseTime);
      return res.status(400).json({
        success: false,
        message: "parentPhone and deviceId are required",
      });
    }

    const now = new Date();
    const readStart = performance.now();

    const existingUser = await User.findOne(
      {
        schoolId,
        "parent.phone": parentPhone,
        "status.active": true,
      },
      {
        _id: 1,
        parentId: 1,
        otpRequests: {
          $elemMatch: {
            deviceId,
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
        message: "Parent account not found",
      });
    }

    if (existingUser.otpRequests?.length) {
      const existingOtp = existingUser.otpRequests[0];

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

    /*
    One update pipeline replaces this device's old OTP and appends the new OTP.
    This removes the previous two sequential updateOne calls.
    */
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
                    input: { $ifNull: ["$otpRequests", []] },
                    as: "request",
                    cond: { $ne: ["$$request.deviceId", deviceId] },
                  },
                },
                [
                  {
                    deviceId,
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
    );

    databaseTime += performance.now() - updateStart;

    if (!result.matchedCount) {
      finishTiming(res, apiStartedAt, databaseTime);
      return res.status(404).json({
        success: false,
        message: "Parent account not found",
      });
    }

    console.log(`New OTP for ${parentPhone}, device ${deviceId}: ${otp}`);

    finishTiming(res, apiStartedAt, databaseTime);
    return res.status(200).json({
      success: true,
      message: "OTP sent successfully",
      data: {
        otp,
        reusedOtp: false,
        expiresInSeconds: 60,
      },
    });
  } catch (error) {
    finishTiming(res, apiStartedAt, databaseTime);
    return res.status(500).json({
      success: false,
      message: "Unable to send OTP",
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
    const { parentPhone, deviceId, otp, fcmToken } = req.body;
    const { schoolId } = req.user;

    if (!schoolId || !parentPhone || !deviceId || !otp || !fcmToken) {
      finishTiming(res, apiStartedAt, databaseTime);
      return res.status(400).json({
        success: false,
        message: "parentPhone, deviceId, otp and fcmToken are required",
      });
    }

    const now = new Date();
    const readStart = performance.now();

    const user = await User.findOne(
      {
        schoolId,
        "parent.phone": parentPhone,
        "status.active": true,
      },
      {
        parentId: 1,
        schoolId: 1,
        parent: 1,
        children: 1,
        otpRequests: {
          $elemMatch: { deviceId },
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
        { $pull: { otpRequests: { deviceId } } },
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
        { $pull: { otpRequests: { deviceId } } },
      );
      databaseTime += performance.now() - cleanupStart;

      finishTiming(res, apiStartedAt, databaseTime);
      return res.status(429).json({
        success: false,
        message: "Too many incorrect attempts. Request a new OTP.",
      });
    }

    if (String(otpRequest.code) !== String(otp)) {
      const attemptStart = performance.now();

      const attemptResult = await User.findOneAndUpdate(
        {
          _id: user._id,
          otpRequests: {
            $elemMatch: {
              deviceId,
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
              $elemMatch: { deviceId },
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

    const consumeStart = performance.now();

    /*
    One atomic update pipeline:
    - consumes the OTP
    - updates an existing device token
    - or appends the device when it does not exist
    */
    const loginResult = await User.updateOne(
      {
        _id: user._id,
        otpRequests: {
          $elemMatch: {
            deviceId,
            code: String(otp),
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
                cond: { $ne: ["$$request.deviceId", deviceId] },
              },
            },
            devices: {
              $concatArrays: [
                {
                  $filter: {
                    input: { $ifNull: ["$devices", []] },
                    as: "device",
                    cond: { $ne: ["$$device.deviceId", deviceId] },
                  },
                },
                [{ deviceId, fcmToken }],
              ],
            },
          },
        },
      ],
    );

    databaseTime += performance.now() - consumeStart;

    if (!loginResult.modifiedCount) {
      finishTiming(res, apiStartedAt, databaseTime);
      return res.status(400).json({
        success: false,
        message: "OTP is invalid, expired, or already used",
      });
    }

    finishTiming(res, apiStartedAt, databaseTime);
    return res.status(200).json({
      success: true,
      message: "OTP verified and login successful",
      data: {
        parentId: user.parentId,
        schoolId: user.schoolId,
        parent: user.parent,
        children: user.children,
        deviceId,
      },
    });
  } catch (error) {
    finishTiming(res, apiStartedAt, databaseTime);
    return res.status(500).json({
      success: false,
      message: "Unable to verify OTP",
      error: error.message,
    });
  }
};

/*
===============================================================================
8. RESEND OTP
===============================================================================
*/
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
    const { parentId, deviceId, fcmToken } = req.body;
    const { schoolId } = req.user;

    if (!schoolId || !parentId || !deviceId || !fcmToken) {
      finishTiming(res, apiStartedAt, databaseTime);
      return res.status(400).json({
        success: false,
        message: "parentId, deviceId and fcmToken are required",
      });
    }

    const dbStart = performance.now();

    /*
    One update pipeline removes the old device record and appends the latest
    token, replacing find -> JavaScript array scan -> save.
    */
    const user = await User.findOneAndUpdate(
      {
        parentId,
        schoolId,
        "status.active": true,
      },
      [
        {
          $set: {
            devices: {
              $concatArrays: [
                {
                  $filter: {
                    input: { $ifNull: ["$devices", []] },
                    as: "device",
                    cond: { $ne: ["$$device.deviceId", deviceId] },
                  },
                },
                [{ deviceId, fcmToken }],
              ],
            },
          },
        },
      ],
      {
        new: true,
        projection: {
          _id: 0,
          parentId: 1,
        },
        lean: true,
      },
    );

    databaseTime += performance.now() - dbStart;

    if (!user) {
      finishTiming(res, apiStartedAt, databaseTime);
      return res.status(404).json({
        success: false,
        message: "Parent account not found",
      });
    }

    finishTiming(res, apiStartedAt, databaseTime);
    return res.status(200).json({
      success: true,
      message: "Device FCM token saved successfully",
      data: {
        parentId: user.parentId,
        deviceId,
      },
    });
  } catch (err) {
    finishTiming(res, apiStartedAt, databaseTime);
    return res.status(500).json({
      success: false,
      message: "Unable to save FCM token",
      error: err.message,
    });
  }
};

/*
===============================================================================
13. LOGOUT DEVICE
===============================================================================
*/
exports.logoutDevice = async (req, res) => {
  const apiStartedAt = performance.now();
  let databaseTime = 0;

  try {
    const { parentId, deviceId } = req.body;
    const { schoolId } = req.user;

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
        message: "Parent account not found",
      });
    }

    finishTiming(res, apiStartedAt, databaseTime);
    return res.status(200).json({
      success: true,
      message: result.modifiedCount
        ? "Current device logged out successfully"
        : "Device was already logged out",
      data: {
        parentId,
        deviceId,
        deviceRemoved: result.modifiedCount > 0,
      },
    });
  } catch (err) {
    finishTiming(res, apiStartedAt, databaseTime);
    return res.status(500).json({
      success: false,
      message: "Unable to logout device",
      error: err.message,
    });
  }
};

/*
===============================================================================
14. GET PARENT BY ID
===============================================================================
*/
exports.getParentById = async (req, res) => {
  const apiStartedAt = performance.now();
  let databaseTime = 0;

  try {
    const { parentId } = req.params;
    const { schoolId } = req.user;
    const dbStart = performance.now();

    const user = await User.findOne({
      parentId,
      schoolId,
    }).lean();

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