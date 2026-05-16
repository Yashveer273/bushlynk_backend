const jwt = require("jsonwebtoken");
const School = require("../models/School");

exports.auth = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(" ")[1];

    if (!token) {
      return res.status(401).json({
        success: false,
        message: "No token provided",
      });
    }

    const decoded = jwt.verify(
      token,
      process.env.JWT_SECRET,
    );

    const school = await School.findById(decoded.id);

    if (!school) {
      return res.status(401).json({
        success: false,
        message: "School not found",
      });
    }

    /*
    ==========================================
    TOKEN VERSION CHECK
    ==========================================
    */

    if (decoded.tv !== school.tokenVersion) {
      return res.status(401).json({
        success: false,
        message: "Session expired. Please login again.",
      });
    }

    req.user = school;
    next();
  } catch (err) {
    return res.status(401).json({
      success: false,
      message: "Invalid token",
    });
  }
};