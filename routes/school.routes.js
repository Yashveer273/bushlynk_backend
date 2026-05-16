// ======================================================
// routes/school.routes.js
// ======================================================

const router = require("express").Router();

const {
  startRegistration,
  completeRegistration,
  loginSchool,
  verifyLoginOtp,
  getProfile,
} = require("../controllers/school.controller");

/*
==================================================
REGISTRATION (STATELESS OTP FLOW)
==================================================
*/

// STEP 1: Generate OTP + return to frontend
router.post("/register/start", startRegistration);

// STEP 2: Complete registration (frontend already verified OTP)
router.post("/register/complete", completeRegistration);

/*
==================================================
LOGIN FLOW (STATELESS OTP)
==================================================
*/

// SEND OTP
router.post("/login", loginSchool);

// VERIFY LOGIN (NO OTP CHECK IN BACKEND IN YOUR NEW DESIGN)
router.post("/login/verify-otp", verifyLoginOtp);

/*
==================================================
PROTECTED
==================================================
*/

router.get("/profile", getProfile);

module.exports = router;