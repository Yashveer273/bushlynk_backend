const generateId = require("../utils/generateId");

const User = require("../models/students");
const School = require("../models/School");

/*
================================================================================
1. SEND REGISTER OTP
================================================================================
*/

exports.sendRegisterOTP = async (req, res) => {

  try {

    const {
      schoolId,
      parentPhone,
    } = req.body;

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
      schoolId,
      parentPhone,
      otp,
    } = req.body;

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

    const {
      schoolId,
      parent,
      child,
      busNumber,
      pickupPointId,
    } = req.body;

    /*
    =====================================
    VALIDATION
    =====================================
    */

    if (
      !schoolId ||
      !parent?.name ||
      !parent?.phone ||
      !child?.studentId ||
      !child?.name ||
      !child?.class ||
      !child?.section ||
      !child?.rollNumber ||
      !busNumber
    ) {

      return res.status(400).json({

        success: false,

        message:
          "Required fields missing",
      });
    }

    /*
    =====================================
    FIND EXISTING PARENT
    =====================================
    */

    let existingParent =
      await User.findOne({

        schoolId,

        "parent.phone":
          parent.phone,
      });

    /*
    =====================================
    CHILD DATA
    =====================================
    */

    const childData = {

      childId:
        generateId("CHI"),

      studentId:
        child.studentId,

      name:
        child.name,

      class:
        child.class,

      section:
        child.section,

      rollNumber:
        child.rollNumber,

      busNumber,

      pickupPointId:
        pickupPointId || null,

      status: {
        active: true,
      },
    };

    /*
    =====================================
    EXISTING PARENT
    ADD CHILD
    =====================================
    */

    if (existingParent) {

      /*
      Prevent duplicate child
      */

      const alreadyChild =
        existingParent.children.some(
          (c) =>
            c.studentId ===
            child.studentId
        );

      if (alreadyChild) {

        return res.status(409).json({

          success: false,

          message:
            "Child already exists",
        });
      }

      existingParent.parent.name =
        parent.name;

      existingParent.children.push(
        childData
      );

      await existingParent.save();

      return res.status(200).json({

        success: true,

        message:
          "New child added successfully",

        data:
          existingParent,
      });
    }

    /*
    =====================================
    CREATE NEW PARENT
    =====================================
    */

    const newParent =
      await User.create({

        parentId:
          generateId("PAR"),

        schoolId,

        parent: {

          name:
            parent.name,

          phone:
            parent.phone,
        },

        children: [
          childData,
        ],

        status: {
          active: true,
        },
      });

    return res.status(201).json({

      success: true,

      message:
        "Parent and child created successfully",

      data:
        newParent,
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
4. SEND LOGIN OTP
================================================================================
*/

exports.sendOTP = async (req, res) => {

  try {

    const {
      schoolId,
      parentPhone,
    } = req.body;

    if (
      !schoolId ||
      !parentPhone
    ) {

      return res.status(400).json({

        success: false,

        message:
          "schoolId and parentPhone required",
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

    const otp =
      Math.floor(
        100000 +
        Math.random() * 900000
      ).toString();

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
      `Login OTP for ${parentPhone}: ${otp}`
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
5. VERIFY LOGIN OTP
================================================================================
*/

exports.verifyOTP = async (req, res) => {

  try {

    const {
      schoolId,
      parentPhone,
      otp,
    } = req.body;

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

      message:
        "Login successful",

      data: user,
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
6. RESEND OTP
================================================================================
*/

exports.resendOTP = async (req, res) => {

  try {

    const {
      schoolId,
      parentPhone,
    } = req.body;

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

    const otp =
      Math.floor(
        100000 +
        Math.random() * 900000
      ).toString();

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

    return res.status(200).json({

      success: true,

      message:
        "OTP resent successfully",

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
7. UPDATE CHILD
================================================================================
*/

exports.updateStudent = async (req, res) => {

  try {

    const {
      parentId,
      childId,
    } = req.params;

    const updates =
      req.body;

    const user =
      await User.findOne({
        parentId,
      });

    if (!user) {

      return res.status(404).json({

        success: false,

        message:
          "Parent not found",
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

        message:
          "Child not found",
      });
    }

    /*
    =====================================
    SAFE UPDATES ONLY
    =====================================
    */

    const allowedFields = [

      "name",

      "class",

      "section",

      "rollNumber",

      "busNumber",

      "pickupPointId",
    ];

    allowedFields.forEach(
      (field) => {

        if (
          updates[field] !== undefined
        ) {

          child[field] =
            updates[field];
        }
      }
    );

    await user.save();

    return res.status(200).json({

      success: true,

      message:
        "Child updated successfully",

      data: user,
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
8. DELETE CHILD
================================================================================
*/

exports.deleteStudent = async (req, res) => {

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

        message:
          "Parent not found",
      });
    }

    const existingChild =
      user.children.find(
        (c) =>
          c.childId === childId
      );

    if (!existingChild) {

      return res.status(404).json({

        success: false,

        message:
          "Child not found",
      });
    }

    /*
    =====================================
    REMOVE CHILD
    =====================================
    */

    user.children =
      user.children.filter(
        (c) =>
          c.childId !== childId
      );

    /*
    =====================================
    DELETE PARENT
    IF NO CHILDREN
    =====================================
    */

    if (
      user.children.length === 0
    ) {

      await User.deleteOne({
        parentId,
      });

      return res.status(200).json({

        success: true,

        message:
          "Parent and child deleted successfully",
      });
    }

    await user.save();

    return res.status(200).json({

      success: true,

      message:
        "Child deleted successfully",

      data: user,
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
9. SAVE FCM TOKEN
================================================================================
*/

exports.saveFcmToken = async (req, res) => {

  try {

    const {
      parentId,
      fcmToken,
    } = req.body;

    if (
      !parentId ||
      !fcmToken
    ) {

      return res.status(400).json({

        success: false,

        message:
          "parentId and fcmToken required",
      });
    }

    const user =
      await User.findOne({
        parentId,
      });

    if (!user) {

      return res.status(404).json({

        success: false,

        message:
          "User not found",
      });
    }

    user.fcmToken =
      fcmToken;

    await user.save();

    return res.status(200).json({

      success: true,

      message:
        "FCM token saved successfully",

      data: {

        parentId:
          user.parentId,

        fcmToken:
          user.fcmToken,
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