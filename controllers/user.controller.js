const generateId = require("../utils/generateId");
const mongoose = require("mongoose");
const User = require("../models/students");
const School = require("../models/School");
const PickupPoint = require("../models/PickupPoint");
/*
================================================================================
1. SEND REGISTER OTP
================================================================================
*/

exports.sendRegisterOTP = async (req, res) => {

  try {

    const {
      
      parentPhone,
    } = req.body;
   const { schoolId } = req.user;
    /*
    =====================================
    VALIDATION
    =====================================
    */

    if (
      !schoolId ||
      !parentPhone
    ) {

      return res.status(400).json({

        success: false,

        message:
          "schoolId and parentPhone are required",
      });
    }

    /*
    =====================================
    CHECK SCHOOL
    =====================================
    */

    const school =
      await School.findOne({
        schoolId,
      });

    if (!school) {

      return res.status(404).json({

        success: false,

        message:
          "School not found",
      });
    }

    /*
    =====================================
    GENERATE OTP
    =====================================
    */

    const otp =
      Math.floor(
        100000 +
        Math.random() * 900000
      ).toString();

    /*
    =====================================
    FIND OR CREATE TEMP USER
    =====================================
    */

    let user =
      await User.findOne({

        schoolId,

        "parent.phone":
          parentPhone,
      });

    if (!user) {

      user = new User({

        parentId:
          generateId("PAR"),

        schoolId,

        parent: {

          name: "TEMP",

          phone:
            parentPhone,
        },

        children: [],
      });
    }

    /*
    =====================================
    SAVE OTP
    =====================================
    */

    user.otp = {

      code: otp,

      expiresAt:
        new Date(
          Date.now() +
          10 * 60 * 1000
        ),

      attempts: 0,
    };

    await user.save();

    console.log(
      `Register OTP for ${parentPhone}: ${otp}`
    );

    return res.status(200).json({

      success: true,

      message:
        "OTP sent successfully",

      data: {
        otp,
      },
    });

  } catch (err) {

    return res.status(500).json({

      success: false,

      error:
        err.message,
    });
  }
};

/*
================================================================================
2. VERIFY REGISTER OTP
================================================================================
*/

exports.verifyRegisterOTP = async (req, res) => {

  try {

    const {
      
      parentPhone,
      otp,
    } = req.body;
   const { schoolId } = req.user;
    if (
      !schoolId ||
      !parentPhone ||
      !otp
    ) {

      return res.status(400).json({

        success: false,

        message:
          "schoolId, parentPhone and otp required",
      });
    }

    const user =
      await User.findOne({

        schoolId,

        "parent.phone":
          parentPhone,
      });

    if (!user) {

      return res.status(404).json({

        success: false,

        message:
          "User not found",
      });
    }

    if (
      !user.otp ||
      user.otp.code !== otp
    ) {

      return res.status(401).json({

        success: false,

        message:
          "Invalid OTP",
      });
    }

    if (
      user.otp.expiresAt <
      new Date()
    ) {

      return res.status(400).json({

        success: false,

        message:
          "OTP expired",
      });
    }

    /*
    =====================================
    CLEAR OTP
    =====================================
    */

    user.otp = undefined;

    await user.save();

    return res.status(200).json({

      success: true,

      verified: true,

      message:
        "OTP verified successfully",
    });

  } catch (err) {

    return res.status(500).json({

      success: false,

      error:
        err.message,
    });
  }
};

/*
================================================================================
3. CREATE STUDENT
================================================================================
*/

exports.createStudent = async (req, res) => {
  try {
    const { parent, child,  } = req.body;
    const { schoolId } = req.user;

    /*
    =====================================
    VALIDATION
    =====================================
    */
    console.log("School ID:", schoolId);
    const missingFields = [];

    if (!schoolId) missingFields.push("schoolId");
    if (!parent?.name) missingFields.push("parent.name");
    if (!parent?.phone) missingFields.push("parent.phone");
   

    // Ensure child exists and is an array with at least one element
    if (!child || !Array.isArray(child) || child.length === 0) {
      missingFields.push("child array (must contain at least one student)");
    } else {
      // Validate every child entity inside the incoming array
      child.forEach((c, index) => {
        if (!c.studentId) missingFields.push(`child[${index}].studentId`);
        if (!c.name) missingFields.push(`child[${index}].name`);
        if (!c.class) missingFields.push(`child[${index}].class`);
        if (!c.section) missingFields.push(`child[${index}].section`);
        if (!c.rollNumber) missingFields.push(`child[${index}].rollNumber`);
      });
    }

    if (missingFields.length > 0) {
      return res.status(400).json({
        success: false,
        message: "Required fields missing",
        missingFields,
      });
    }

    /*
    =====================================
    FIND EXISTING PARENT
    =====================================
    */
    let existingParent = await User.findOne({
      schoolId,
      "parent.phone": parent.phone,
    });

    /*
    =====================================
    MAP MULTIPLE CHILDREN DATA
    =====================================
    */
    const childrenDataArray = child.map((c) => ({
      childId: generateId("CHI"),
      studentId: c.studentId,
      name: c.name,
      class: c.class,
      section: c.section,
      rollNumber: c.rollNumber,
    
      status: {
        active: true,
      },
    }));

    /*
    =====================================
    EXISTING PARENT MANAGEMENT WORKFLOW
    =====================================
    */
    if (existingParent) {
      const duplicateStudentIds = [];
      
      // Look for overlaps within existing storage profiles
      childrenDataArray.forEach((newChild) => {
        const alreadyChild = existingParent.children.some(
          (c) => c.studentId === newChild.studentId
        );
        if (alreadyChild) {
          duplicateStudentIds.push(newChild.studentId);
        }
      });

      if (duplicateStudentIds.length > 0) {
        return res.status(409).json({
          success: false,
          message: "One or more student records already exist under this parent profile setup.",
          duplicateStudentIds,
        });
      }

      // Update name metrics if changed, and push all children entries safely
      existingParent.parent.name = parent.name;
      existingParent.children.push(...childrenDataArray);

      await existingParent.save();

      return res.status(200).json({
        success: true,
        message: "Supplemental child profiles attached to parent account registry records successfully.",
        data: existingParent,
      });
    }

    /*
    =====================================
    CREATE NEW PARENT WITH ALL CHILDREN
    =====================================
    */
    const newParent = await User.create({
      parentId: generateId("PAR"),
      schoolId,
      parent: {
        name: parent.name,
        phone: parent.phone,
      },
      children: childrenDataArray, // Assigns the entire pre-mapped child configuration matrix
      status: {
        active: true,
      },
    });

    return res.status(201).json({
      success: true,
      message: "Parent profile database matrix and corresponding child structures synchronized.",
      data: newParent,
    });

  } catch (err) {
    return res.status(500).json({
      success: false,
      error: err.message,
    });
  }
};
exports.addChild = async (req, res) => {
  try {
    const { parentId } = req.params;
  const { schoolId } = req.user;
    // Validate parentId exists
    if (!parentId ||parentId==="undefined") {
      return res.status(400).json({
        success: false,
        message: "Parent ID is required",
      });
    }

    const {
      
      studentId,
      name,
      class: studentClass,
      section,
      rollNumber,
    
    } = req.body;

    const missingFields = [];

  

    if (!studentId)
      missingFields.push("studentId");

    if (!name)
      missingFields.push("name");

    if (!studentClass)
      missingFields.push("class");

    if (!section)
      missingFields.push("section");

    if (!rollNumber)
      missingFields.push("rollNumber");

   

    if (!pickupPointId)
      missingFields.push(
        "pickupPointId"
      );

    if (missingFields.length) {
      return res.status(400).json({
        success: false,
        message:
          "Required fields missing",
        missingFields,
      });
    }

    const user =
      await User.findOne({ parentId,schoolId });

    if (!user) {
      return res.status(404).json({
        success: false,
        message:
          "Parent not found",
      });
    }
const childId= generateId("CHI"); 
    user.children.push({
      childId,
      studentId,
      name,
      class: studentClass,
      section,
      rollNumber,
   
      status: {
        active: true,
      },
    });

    await user.save();

    return res.status(200).json({
      success: true,
      message:
        "Child added successfully",
      data: user,
    });
  } catch (error) {
    console.log(error);

    return res.status(500).json({
      success: false,
      message: "Server Error",
    });
  }
};

exports.getStudentIdsByParentPhone = async (req, res) => {
  try {
    const { phone } = req.params;
    const { schoolId } = req.user;

    const cleanPhone = String(phone || "").replace(/\D/g, "");

    if (!/^[6-9]\d{9}$/.test(cleanPhone)) {
      return res.status(400).json({
        success: false,
        message: "Valid 10-digit phone number is required",
      });
    }

    const parent = await User.findOne({
      schoolId,
      "parent.phone": cleanPhone,
    })
      .select("parentId children.studentId children.name")
      .lean();

    if (!parent) {
      return res.status(404).json({
        success: false,
        message: "Parent not found",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Parent and student IDs fetched successfully",
      data: {
        parentId: parent.parentId,
        children: parent.children.map((child) => ({
          studentId: child.studentId,
          studentName: child.name || null,
        })),
      },
    });
  } catch (error) {
    console.error("Get student IDs by phone error:", error);

    return res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};
/*
================================================================================
4. SEND LOGIN OTP
================================================================================
*/

exports.sendOTP = async (req, res) => {
  try {
    const { parentPhone, deviceId } = req.body;
    const { schoolId } = req.user;

    if (!schoolId || !parentPhone || !deviceId) {
      return res.status(400).json({
        success: false,
        message: "parentPhone and deviceId are required",
      });
    }

    const now = new Date();

    /*
    Find an existing active OTP for this specific device.
    */
    const existingUser = await User.findOne(
      {
        schoolId,
        "parent.phone": parentPhone,
        "status.active": true,

        otpRequests: {
          $elemMatch: {
            deviceId,
            expiresAt: {
              $gt: now,
            },
          },
        },
      },
      {
        parentId: 1,
        otpRequests: {
          $elemMatch: {
            deviceId,
            expiresAt: {
              $gt: now,
            },
          },
        },
      }
    ).lean();

    if (existingUser?.otpRequests?.length) {
      const existingOtp = existingUser.otpRequests[0];

      console.log(
        `Existing OTP for ${parentPhone}, device ${deviceId}: ${existingOtp.code}`
      );

      // await sendSms(parentPhone, existingOtp.code);

      return res.status(200).json({
        success: true,
        message: "Existing OTP sent again",

        data: {
          // Remove this in production.
          otp: existingOtp.code,

          reusedOtp: true,

          expiresInSeconds: Math.max(
            0,
            Math.floor(
              (
                new Date(existingOtp.expiresAt).getTime() -
                Date.now()
              ) / 1000
            )
          ),
        },
      });
    }

    /*
    Confirm that the parent account exists.
    */
    const parentExists = await User.exists({
      schoolId,
      "parent.phone": parentPhone,
      "status.active": true,
    });

    if (!parentExists) {
      return res.status(404).json({
        success: false,
        message: "Parent account not found",
      });
    }

    const otp = Math.floor(
      100000 + Math.random() * 900000
    ).toString();

    const expiresAt = new Date(
      Date.now() + 60 * 1000
    );

    /*
    Remove the old OTP entry for this device.

    This removes:
    - expired OTP
    - blocked OTP
    - any previous incomplete request
    */
    await User.updateOne(
      {
        schoolId,
        "parent.phone": parentPhone,
      },
      {
        $pull: {
          otpRequests: {
            deviceId,
          },
        },
      }
    );

    /*
    Add a new OTP only for the requesting device.
    */
    const result = await User.updateOne(
      {
        schoolId,
        "parent.phone": parentPhone,
        "status.active": true,
      },
      {
        $push: {
          otpRequests: {
            deviceId,
            code: otp,
            expiresAt,
            attempts: 0,
          },
        },
      }
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({
        success: false,
        message: "Parent account not found",
      });
    }

    console.log(
      `New OTP for ${parentPhone}, device ${deviceId}: ${otp}`
    );

    // await sendSms(parentPhone, otp);

    return res.status(200).json({
      success: true,
      message: "OTP sent successfully",

      data: {
        // Remove this in production.
        otp,

        reusedOtp: false,
        expiresInSeconds: 60,
      },
    });
  } catch (error) {
    console.error("SEND OTP ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to send OTP",
      error: error.message,
    });
  }
};

/*
================================================================================
5. VERIFY LOGIN OTP
================================================================================


REQUEST:
{
  "parentPhone": "9876543210",
  "deviceId": "device-installation-id",
  "otp": "123456",
  "fcmToken": "firebase-token"
}
*/

exports.verifyOTP = async (req, res) => {
  try {
    const {
      parentPhone,
      deviceId,
      otp,
      fcmToken,
    } = req.body;

    const { schoolId } = req.user;

    if (
      !schoolId ||
      !parentPhone ||
      !deviceId ||
      !otp ||
      !fcmToken
    ) {
      return res.status(400).json({
        success: false,
        message:
          "parentPhone, deviceId, otp and fcmToken are required",
      });
    }

    /*
    Get only the OTP entry for this device.
    */
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
          $elemMatch: {
            deviceId,
          },
        },
      }
    ).lean();

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "Parent account not found",
      });
    }

    if (!user.otpRequests?.length) {
      return res.status(400).json({
        success: false,
        message: "OTP was not requested for this device",
      });
    }

    const otpRequest = user.otpRequests[0];

    /*
    Check OTP expiry.
    */
    if (
      !otpRequest.expiresAt ||
      new Date(otpRequest.expiresAt) <= new Date()
    ) {
      await User.updateOne(
        {
          schoolId,
          "parent.phone": parentPhone,
        },
        {
          $pull: {
            otpRequests: {
              deviceId,
            },
          },
        }
      );

      return res.status(400).json({
        success: false,
        message: "OTP expired. Please request a new OTP.",
      });
    }

    /*
    Check maximum attempts.
    */
    if ((otpRequest.attempts || 0) >= 5) {
      await User.updateOne(
        {
          schoolId,
          "parent.phone": parentPhone,
        },
        {
          $pull: {
            otpRequests: {
              deviceId,
            },
          },
        }
      );

      return res.status(429).json({
        success: false,
        message:
          "Too many incorrect attempts. Request a new OTP.",
      });
    }

    /*
    Incorrect OTP:
    increase attempts only for the matching device entry.
    */
    if (
      String(otpRequest.code) !==
      String(otp)
    ) {
      const attemptResult =
        await User.findOneAndUpdate(
          {
            schoolId,
            "parent.phone": parentPhone,

            otpRequests: {
              $elemMatch: {
                deviceId,
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
                  deviceId,
                },
              },
            },
          }
        ).lean();

      const updatedAttempts =
        attemptResult?.otpRequests?.[0]?.attempts ??
        (otpRequest.attempts || 0) + 1;

      return res.status(401).json({
        success: false,
        message: "Invalid OTP",

        attemptsRemaining: Math.max(
          0,
          5 - updatedAttempts
        ),
      });
    }

    /*
    OTP is correct.

    Remove only this device's OTP.
    The query also checks the code and expiry again,
    preventing an expired OTP from being consumed.
    */
    const consumeResult = await User.updateOne(
      {
        schoolId,
        "parent.phone": parentPhone,

        otpRequests: {
          $elemMatch: {
            deviceId,
            code: String(otp),
            expiresAt: {
              $gt: new Date(),
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
            deviceId,
          },
        },
      }
    );

    if (consumeResult.modifiedCount === 0) {
      return res.status(400).json({
        success: false,
        message:
          "OTP is invalid, expired, or already used",
      });
    }

    /*
    First try to update the FCM token when the
    device already exists.
    */
    const updateDeviceResult =
      await User.updateOne(
        {
          parentId: user.parentId,
          schoolId,

          devices: {
            $elemMatch: {
              deviceId,
            },
          },
        },
        {
          $set: {
            "devices.$.fcmToken":
              fcmToken,
          },
        }
      );

    /*
    If the device does not exist, add it.
    */
    if (updateDeviceResult.matchedCount === 0) {
      await User.updateOne(
        {
          parentId: user.parentId,
          schoolId,

          "devices.deviceId": {
            $ne: deviceId,
          },
        },
        {
          $push: {
            devices: {
              deviceId,
              fcmToken,
            },
          },
        }
      );
    }

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
    console.error("VERIFY OTP ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to verify OTP",
      error: error.message,
    });
  }
};


/*
================================================================================
RESEND LOGIN OTP
================================================================================
*/

exports.resendOTP = async (req, res) => {
  try {
    const { parentPhone, deviceId } = req.body;
    const { schoolId } = req.user;

    if (!schoolId || !parentPhone || !deviceId) {
      return res.status(400).json({
        success: false,
        message: "parentPhone and deviceId are required",
      });
    }

    const now = new Date();

    /*
    Check whether this device already has
    an active OTP.
    */
    const existingUser = await User.findOne(
      {
        schoolId,
        "parent.phone": parentPhone,
        "status.active": true,

        otpRequests: {
          $elemMatch: {
            deviceId,
            expiresAt: {
              $gt: now,
            },
          },
        },
      },
      {
        otpRequests: {
          $elemMatch: {
            deviceId,
            expiresAt: {
              $gt: now,
            },
          },
        },
      }
    ).lean();

    if (existingUser?.otpRequests?.length) {
      const existingOtp = existingUser.otpRequests[0];

      console.log(
        `Resent existing OTP for ${parentPhone}, device ${deviceId}: ${existingOtp.code}`
      );

      // await sendSms(parentPhone, existingOtp.code);

      return res.status(200).json({
        success: true,
        message: "Existing OTP resent successfully",

        data: {
          // Remove this in production.
          otp: existingOtp.code,

          reusedOtp: true,

          expiresInSeconds: Math.max(
            0,
            Math.floor(
              (
                new Date(existingOtp.expiresAt).getTime() -
                Date.now()
              ) / 1000
            )
          ),
        },
      });
    }

    const parentExists = await User.exists({
      schoolId,
      "parent.phone": parentPhone,
      "status.active": true,
    });

    if (!parentExists) {
      return res.status(404).json({
        success: false,
        message: "Parent account not found",
      });
    }

    const otp = Math.floor(
      100000 + Math.random() * 900000
    ).toString();

    const expiresAt = new Date(
      Date.now() + 60 * 1000
    );

    /*
    Remove only this device's previous OTP.
    OTPs belonging to other devices remain unchanged.
    */
    await User.updateOne(
      {
        schoolId,
        "parent.phone": parentPhone,
      },
      {
        $pull: {
          otpRequests: {
            deviceId,
          },
        },
      }
    );

    /*
    Push the new OTP for this device.
    */
    await User.updateOne(
      {
        schoolId,
        "parent.phone": parentPhone,
        "status.active": true,
      },
      {
        $push: {
          otpRequests: {
            deviceId,
            code: otp,
            expiresAt,
            attempts: 0,
          },
        },
      }
    );

    console.log(
      `New resend OTP for ${parentPhone}, device ${deviceId}: ${otp}`
    );

    // await sendSms(parentPhone, otp);

    return res.status(200).json({
      success: true,
      message: "New OTP generated and sent successfully",

      data: {
        // Remove this in production.
        otp,

        reusedOtp: false,
        expiresInSeconds: 60,
      },
    });
  } catch (error) {
    console.error("RESEND OTP ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to resend OTP",
      error: error.message,
    });
  }
};

/*
================================================================================
7. UPDATE CHILD
================================================================================
*/

exports.updateStudent = async (req, res) => {
  try {
    const { parentId } = req.params;
    const { schoolId } = req.user;

    const { 
      parent, 
      child, // The dynamic array sent from frontend matrix
   
    } = req.body;

    // Find the master parent document
    const user = await User.findOne({
      _id: parentId,
      schoolId: schoolId
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "Parent profile not found",
      });
    }

    /*
    =====================================
    1. UPDATE PARENT CORE DATA
    =====================================
    */
    if (parent) {
      if (parent.name !== undefined) user.parent.name = parent.name;
      if (parent.phone !== undefined) user.parent.phone = parent.phone;
    }

    /*
    =====================================
    2. SYNCHRONIZE CHILD NESTED STACK
    =====================================
    */
    if (child && Array.isArray(child)) {
      user.children = child.map(c => {
        // Generate clean custom tracking strings
        const calculatedStudentId = c.studentId || `STU-${Date.now().toString().slice(-6)}`;
        
        // Match existing document _id if available, otherwise let Mongoose create an ObjectId
        const subdocId = (c._id && mongoose.Types.ObjectId.isValid(c._id)) ? c._id : new mongoose.Types.ObjectId();

        return {
          _id: subdocId, 
           // Fulfills schema: required: true
          studentId: calculatedStudentId, // Fulfills schema: required: true
          name: c.studentName || c.name,
          class: c.class || "N/A",
          section: c.section || "-",     // Fulfills schema validation if empty string
          rollNumber: c.rollNumber || "-", // Fulfills schema validation if empty string
       
          status: { active: true }
        };
      });
    }

    /*
    =====================================
    3. SAVE CHANGES
    =====================================
    */
    await user.save();

    return res.status(200).json({
      success: true,
      message: "Parent workspace node and nested student array updated completely!",
      data: user,
    });

  } catch (err) {
    return res.status(500).json({
      success: false,
      error: err.message,
    });
  }
};

/*
================================================================================
8. DELETE CHILD
================================================================================
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
  try {
    const {
      parentId,
      deviceId,
      fcmToken,
    } = req.body;

    const { schoolId } = req.user;

    if (
      !schoolId ||
      !parentId ||
      !deviceId ||
      !fcmToken
    ) {
      return res.status(400).json({
        success: false,
        message:
          "parentId, deviceId and fcmToken are required",
      });
    }

    const user = await User.findOne({
      parentId,
      schoolId,
      "status.active": true,
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "Parent account not found",
      });
    }

    if (!Array.isArray(user.devices)) {
      user.devices = [];
    }

    const existingDevice = user.devices.find(
      (device) =>
        device.deviceId === deviceId
    );

    if (existingDevice) {
      existingDevice.fcmToken = fcmToken;
    } else {
      user.devices.push({
        deviceId,
        fcmToken,
      });
    }

    await user.save();

    return res.status(200).json({
      success: true,

      message: existingDevice
        ? "FCM token updated successfully"
        : "Device FCM token saved successfully",

      data: {
        parentId: user.parentId,
        deviceId,
      },
    });
  } catch (err) {
    console.error("SAVE FCM TOKEN ERROR:", err);

    return res.status(500).json({
      success: false,
      message: "Unable to save FCM token",
      error: err.message,
    });
  }
};
/*
================================================================================
LOGOUT CURRENT DEVICE
================================================================================
*/

exports.logoutDevice = async (req, res) => {
  try {
    const {
      parentId,
      deviceId,
    } = req.body;

    const { schoolId } = req.user;

    if (
      !schoolId ||
      !parentId ||
      !deviceId
    ) {
      return res.status(400).json({
        success: false,
        message:
          "parentId and deviceId are required",
      });
    }

    const result = await User.updateOne(
      {
        parentId,
        schoolId,
      },
      {
        $pull: {
          devices: {
            deviceId,
          },
        },
      }
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({
        success: false,
        message: "Parent account not found",
      });
    }

    return res.status(200).json({
      success: true,

      message:
        result.modifiedCount > 0
          ? "Current device logged out successfully"
          : "Device was already logged out",

      data: {
        parentId,
        deviceId,
        deviceRemoved:
          result.modifiedCount > 0,
      },
    });
  } catch (err) {
    console.error("LOGOUT DEVICE ERROR:", err);

    return res.status(500).json({
      success: false,
      message: "Unable to logout device",
      error: err.message,
    });
  }
};
/*
================================================================================
10. GET PARENT BY ID
================================================================================
*/

exports.getParentById = async (req, res) => {
  try {

    const { parentId } = req.params;
    const { schoolId } = req.user;

    const user = await User.findOne({
      parentId,
      schoolId,
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "Parent not found",
      });
    }

    return res.status(200).json({
      success: true,
      data: user,
    });

  } catch (err) {

    return res.status(500).json({
      success: false,
      error: err.message,
    });

  }
};

/*
================================================================================
11. GET PARENTS PAGINATION
================================================================================
*/

exports.getParentsPagination = async (req, res) => {

  try {

    let {
      page = 1,
      limit = 10,
      search = "",
    } = req.query;

    page = Number(page);
    limit = Number(limit);

    const query = {};

    if (search) {
      query.$or = [
        {
          "parent.name": {
            $regex: search,
            $options: "i",
          },
        },
        {
          "parent.phone": {
            $regex: search,
            $options: "i",
          },
        },
        {
          parentId: {
            $regex: search,
            $options: "i",
          },
        },
      ];
    }

    const totalRecords =
      await User.countDocuments(query);

    const data =
      await User.find(query)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit);

    return res.status(200).json({

      success: true,

      pagination: {
        totalRecords,
        currentPage: page,
        totalPages: Math.ceil(
          totalRecords / limit
        ),
        limit,
      },

      data,
    });

  } catch (err) {

    return res.status(500).json({
      success: false,
      error: err.message,
    });

  }
};

/*
================================================================================
12. GET SINGLE CHILD
================================================================================
*/

exports.getChildById = async (req, res) => {

  try {

    const {
      parentId,
      childId,
    } = req.params;

    const user =
      await User.findOne({
        parentId,
      });

    if (!user) {

      return res.status(404).json({
        success: false,
        message: "Parent not found",
      });
    }

    const child =
      user.children.find(
        (c) =>
          c.childId === childId
      );

    if (!child) {

      return res.status(404).json({
        success: false,
        message: "Child not found",
      });
    }

    return res.status(200).json({

      success: true,

      data: child,
    });

  } catch (err) {

    return res.status(500).json({
      success: false,
      error: err.message,
    });

  }
};