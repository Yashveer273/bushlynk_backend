const jwt = require("jsonwebtoken");
const Driver = require("../models/Driver");
const School = require("../models/School");
const User = require("../models/students");

exports.auth = async (req, res, next) => {

  try {
    /*
    =====================================
    GET AUTH HEADER
    =====================================
    */

    const authHeader = req.headers.authorization;



    /*
    =====================================
    VALIDATE HEADER
    =====================================
    */

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({
        success: false,

        message: "Token missing",
      });
    }

    /*
    =====================================
    EXTRACT TOKEN
    =====================================
    */

    const token = authHeader.split(" ")[1];

    console.log("TOKEN:", token);

    if (!token) {
      return res.status(401).json({
        success: false,

        message: "Invalid token format",
      });
    }

    /*
    =====================================
    VERIFY TOKEN
    =====================================
    */

    const decoded = jwt.verify(token.trim(), "0000000");

    console.log("DECODED:", decoded);

    /*
    =====================================
    FIND SCHOOL
    =====================================
    */

    const school = await School.findById(decoded.id);

    if (!school) {
      return res.status(401).json({
        success: false,

        message: "School not found",
      });
    }

    /*
    =====================================
    TOKEN VERSION CHECK
    =====================================
    */

    if (decoded.tv !== school.tokenVersion) {
      return res.status(401).json({
        success: false,

        message: "Session expired. Login again.",
      });
    }

    /*
    =====================================
    STORE USER
    =====================================
    */

    req.user = {
      id: school._id,

      schoolId: school.schoolId,
phone: school.phone,
    
    };

    next();
  } catch (err) {
    console.log("AUTH ERROR:", err.message);

    return res.status(401).json({
      success: false,

      message: "Invalid token",
    });
  }
};


exports.driverAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({
        success: false,
        message: "Token missing",
      });
    }

    const token = authHeader.split(" ")[1];

    const driver = await Driver.findOne({ token }).select('-loginHistory').lean();

    if (!driver) {
      return res.status(401).json({
        success: false,
        message: "Invalid token",
      });
    }

    req.driver = driver;
    req.schoolId = driver.schoolId;

    next();
  } catch (error) {
    console.log(error);

    return res.status(500).json({
      success: false,
      message: "Auth server error",
    });
  }
};



exports.verifyParentToken = async (req, res, next) => {
  try {
    const authorization = req.headers.authorization || "";

    if (!authorization.startsWith("Bearer ")) {
      return res.status(401).json({
        success: false,
        message: "Token missing",
      });
    }

    const token = authorization.slice(7).trim();

    if (!token || !process.env.JWT_SECRET) {
      return res.status(401).json({
        success: false,
        message: "Invalid token configuration",
      });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    if (decoded.role !== "parent" || !decoded.deviceId) {
      return res.status(403).json({
        success: false,
        message: "Invalid parent device token",
      });
    }

    const user = await User.findOne(
      {
        _id: decoded.userId,
        parentId: decoded.parentId,
        schoolId: decoded.schoolId,
        "status.active": true,
        devices: {
          $elemMatch: {
            deviceId: decoded.deviceId,
            token,
            tokenExpiry: { $gt: new Date() },
          },
        },
      },
      {
        parentId: 1,
        schoolId: 1,
      },
    ).lean();

    if (!user) {
      return res.status(401).json({
        success: false,
        message: "Session expired or this device has been logged out",
      });
    }

    req.user = {
      userId: String(user._id),
      parentId: user.parentId,
      schoolId: user.schoolId,
      deviceId: decoded.deviceId,
      role: "parent",
    };

    return next();
  } catch (error) {
    if (error.name === "TokenExpiredError") {
      return res.status(401).json({
        success: false,
        message: "Token expired. Please log in again.",
      });
    }

    return res.status(401).json({
      success: false,
      message: "Invalid token",
    });
  }
};
