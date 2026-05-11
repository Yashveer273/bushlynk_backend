const generateId = require("../utils/generateId");

const User = require("../models/students");
const School = require("../models/School");

/*
  Generate and send OTP to parent phone
*/
exports.sendOTP = async (req, res) => {
  try {
    const { parentPhone, schoolId } = req.body;

    if (!parentPhone || !schoolId) {
      return res.status(400).json({
        success: false,
        message: "parentPhone and schoolId are required",
      });
    }

    // Check if parent exists in system
    const user = await User.findOne({
      "parent.phone": parentPhone,
      schoolId,
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        message:
          "Parent not found in system. Please register first through school.",
      });
    }

    // Generate 6-digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    // Save OTP to database
    const updatedUser = await User.findByIdAndUpdate(
      user._id,
      {
        otp: {
          code: otp,
          expiresAt: expiresAt,
          attempts: 0,
        },
      },
      { new: true, runValidators: true }
    );

    if (!updatedUser) {
      return res.status(500).json({
        success: false,
        message: "Failed to save OTP",
      });
    }

    // TODO: Send OTP via SMS service (Twilio, Firebase, etc.)
    console.log(`OTP for ${parentPhone}: ${otp}`);

    res.status(200).json({
      success: true,
      message: "OTP sent to registered phone number",
      data: {
        expiresIn: "10 minutes",
        // For development - remove in production
        otp: otp,
      },
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: err.message,
    });
  }
};

/*
  Verify OTP and login parent
*/
exports.verifyOTP = async (req, res) => {
  try {
    const { parentPhone, otp, schoolId } = req.body;

    if (!parentPhone || !otp || !schoolId) {
      return res.status(400).json({
        success: false,
        message: "parentPhone, otp, and schoolId are required",
      });
    }

    const user = await User.findOne({
      "parent.phone": parentPhone,
      schoolId,
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "Parent not found",
      });
    }

    // Check if OTP exists
    if (!user.otp || !user.otp.code) {
      return res.status(400).json({
        success: false,
        message: "No OTP found. Please request a new OTP.",
      });
    }

    // Check if OTP expired
    if (new Date() > user.otp.expiresAt) {
      // Clear expired OTP
      await User.findByIdAndUpdate(user._id, {
        $unset: { otp: "" }
      });
      return res.status(400).json({
        success: false,
        message: "OTP expired. Please request a new OTP.",
      });
    }

    // Check OTP attempts (max 3)
    if (user.otp.attempts >= 3) {
      // Clear OTP after max attempts
      await User.findByIdAndUpdate(user._id, {
        $unset: { otp: "" }
      });
      return res.status(400).json({
        success: false,
        message: "Maximum OTP attempts exceeded. Request a new OTP.",
      });
    }

    // Verify OTP
    if (user.otp.code !== otp) {
      // Increment attempts
      await User.findByIdAndUpdate(user._id, {
        $inc: { "otp.attempts": 1 }
      });

      return res.status(401).json({
        success: false,
        message: "Invalid OTP",
      });
    }

    // OTP verified - clear OTP and return user data
    await User.findByIdAndUpdate(user._id, {
      $unset: { otp: "" }
    });

    // Return user data
    res.status(200).json({
      success: true,
      message: "Login successful",
      data: {
        userId: user.userId,
        parentName: user.parent.name,
        parentPhone: user.parent.phone,
        schoolId: user.schoolId,
        children: user.child,
        busNumber: user.busNumber,
        pickupPointId: user.pickupPointId,
      },
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: err.message,
    });
  }
};

/*
  Resend OTP
*/
exports.resendOTP = async (req, res) => {
  try {
    const { parentPhone, schoolId } = req.body;

    if (!parentPhone || !schoolId) {
      return res.status(400).json({
        success: false,
        message: "parentPhone and schoolId are required",
      });
    }

    const user = await User.findOne({
      "parent.phone": parentPhone,
      schoolId,
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "Parent not found",
      });
    }

    // Generate new OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

    // Save new OTP to database
    const updatedUser = await User.findByIdAndUpdate(
      user._id,
      {
        otp: {
          code: otp,
          expiresAt: expiresAt,
          attempts: 0,
        },
      },
      { new: true, runValidators: true }
    );

    if (!updatedUser) {
      return res.status(500).json({
        success: false,
        message: "Failed to save OTP",
      });
    }

    // TODO: Send OTP via SMS service
    console.log(`Resend OTP for ${parentPhone}: ${otp}`);

    res.status(200).json({
      success: true,
      message: "New OTP sent to registered phone number",
      data: {
        expiresIn: "10 minutes",
        // For development - remove in production
        otp: otp,
      },
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: err.message,
    });
  }
};

// =========================================
// controllers/user.controller.js
// =========================================



/*
=========================================
SAVE / UPDATE FCM TOKEN
=========================================
*/

exports.saveFcmToken =
  async (req, res) => {

    try {

      const {
        userId,
        fcmToken,
      } = req.body;

      /*
      =====================================
      VALIDATION
      =====================================
      */

      if (
        !userId ||
        !fcmToken
      ) {

        return res.status(400).json({

          success: false,

          message:
            "userId and fcmToken are required",
        });
      }

      /*
      =====================================
      FIND USER
      =====================================
      */

      const user =
        await User.findOne({
          userId,
        });

      if (!user) {

        return res.status(404).json({

          success: false,

          message:
            "User not found",
        });
      }

      /*
      =====================================
      SAVE FCM TOKEN
      =====================================
      */

      user.fcmToken =
        fcmToken;

      await user.save();

      return res.status(200).json({

        success: true,

        message:
          "FCM token saved successfully",

        data: {
          userId:
            user.userId,

          fcmToken:
            user.fcmToken,
        },
      });

    } catch (err) {

      console.log(
        "Save FCM Error:",
        err
      );

      return res.status(500).json({

        success: false,

        message:
          "Server Error",
      });
    }
  };