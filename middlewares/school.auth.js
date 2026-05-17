const jwt = require("jsonwebtoken");

const School = require("../models/School");

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
