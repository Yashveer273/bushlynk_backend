// ======================================================
// controllers/school.controller.js
// COMPLETE VERSION (SESSIONLESS OTP + TOKEN VERSION)
// ======================================================

const School = require("../models/School");
const jwt = require("jsonwebtoken");

/*
==================================================
OTP GENERATOR
==================================================
*/

const generateOtp = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

/*
==================================================
JWT GENERATOR (TOKEN VERSION INCLUDED)
==================================================
*/

const generateToken = (school) => {
  const secret = "0000000";

  if (!secret) {
    throw new Error("JWT_SECRET missing in env");
  }

  return jwt.sign(
    {
      id: school._id,
      schoolId: school.schoolId,
      phone: school.contact.phone,
      tv: school.tokenVersion, // token version
    },
    secret,
    { expiresIn: "30d" },
  );
};

/*
==================================================
START REGISTRATION (RETURN OTP TO FRONTEND)
==================================================
*/

exports.startRegistration = async (req, res) => {
  try {
    const { schoolId, name, phone } = req.body;

    if (!schoolId || !name || !phone) {
      return res.status(400).json({
        success: false,
        message: "schoolId, name, phone required",
      });
    }

    const phoneRegex = /^[6-9]\d{9}$/;

    if (!phoneRegex.test(phone)) {
      return res.status(400).json({
        success: false,
        message: "Invalid phone number",
      });
    }

    let formattedSchoolId = schoolId.trim().toUpperCase();
    if (!formattedSchoolId.startsWith("SCH-")) {
      formattedSchoolId = `SCH-${formattedSchoolId}`;
    }

    const existing = await School.findOne({
      $or: [
        { schoolId: formattedSchoolId },
        { "contact.phone": phone },
      ],
    });

    if (existing) {
      return res.status(409).json({
        success: false,
        message: "School already registered",
      });
    }

    const otp = generateOtp();

    console.log(`OTP for ${phone}: ${otp}`);

    return res.status(200).json({
      success: true,
      message: "OTP generated",
      otp, // ⚠️ frontend handles verification
      schoolData: {
        schoolId: formattedSchoolId,
        name,
        phone,
      },
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      error: err.message,
    });
  }
};

/*
==================================================
COMPLETE REGISTRATION (CREATE SCHOOL)
==================================================
*/

exports.completeRegistration = async (req, res) => {
  try {
    const {
      schoolId,
      name,
      phone,
      email,
      address,
    } = req.body;

    if (!schoolId || !name || !phone || !email) {
      return res.status(400).json({
        success: false,
        message: "Missing required fields",
      });
    }

    const emailRegex =
      /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!emailRegex.test(email)) {
      return res.status(400).json({
        success: false,
        message: "Invalid email format",
      });
    }

    const exists = await School.findOne({
      $or: [
        { schoolId },
        { "contact.phone": phone },
        { "contact.email": email.toLowerCase() },
      ],
    });

    if (exists) {
      return res.status(409).json({
        success: false,
        message: "Already registered",
      });
    }

    const school = await School.create({
      schoolId,
      name,

      contact: {
        phone,
        email: email.toLowerCase(),
      },

      address: {
        line1: address.line1,
        city: address.city,
        state: address.state,
        country: address.country,
        pincode: address.pincode,
        latitude: address.latitude,
        longitude: address.longitude,
      },

      tokenVersion: 1, // important
      isVerified: true,
    });

    const token = generateToken(school);

    return res.status(201).json({
      success: true,
      message: "Registration successful",
      token,
      school,
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      error: err.message,
    });
  }
};

/*
==================================================
LOGIN SCHOOL (OTP GENERATION ONLY)
==================================================
*/

exports.loginSchool = async (req, res) => {
  try {
    const { phone } = req.body;

    if (!phone) {
      return res.status(400).json({
        success: false,
        message: "Phone required",
      });
    }

    const school = await School.findOne({
      "contact.phone": phone,
    });

    if (!school) {
      return res.status(404).json({
        success: false,
        message: "School not found",
      });
    }

    const otp = generateOtp();

    console.log(`LOGIN OTP ${phone}: ${otp}`);

    return res.status(200).json({
      success: true,
      message: "OTP sent",
      otp,
      phone,
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      error: err.message,
    });
  }
};

/*
==================================================
VERIFY LOGIN OTP (INCREMENT TOKEN VERSION)
==================================================
*/

exports.verifyLoginOtp = async (req, res) => {
  try {
    const { phone } = req.body;

    const school = await School.findOne({
      "contact.phone": phone,
    });

    if (!school) {
      return res.status(404).json({
        success: false,
        message: "School not found",
      });
    }

    school.tokenVersion += 1;
    await school.save();

    const token = generateToken(school);

    return res.status(200).json({
      success: true,
      message: "Login successful",
      token,
      
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      error: err.message,
    });
  }
};

/*
==================================================
GET PROFILE
==================================================
*/

exports.getProfile = async (req, res) => {
  try {
    const school = await School.findById(req.user.id);

    return res.status(200).json({
      success: true,
      school,
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      error: err.message,
    });
  }
};

