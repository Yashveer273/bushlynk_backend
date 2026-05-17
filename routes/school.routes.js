// ======================================================
// routes/school.routes.js
// ======================================================

const router =
  require("express").Router();

const {
  startRegistration,
  completeRegistration,
  loginSchool,
  verifyLoginOtp,
  getProfile,
    logoutSchool
} = require("../controllers/school.controller");

/*
==================================================
AUTH MIDDLEWARE
==================================================
*/

const {
  auth
} = require("../middlewares/school.auth");

/*
==================================================
REGISTRATION (STATELESS OTP FLOW)
==================================================
*/

// STEP 1: Generate OTP
router.post(
  "/register/start",
  startRegistration
);

// STEP 2: Complete registration
router.post(
  "/register/complete",
  completeRegistration
);

/*
==================================================
LOGIN FLOW
==================================================
*/

// SEND OTP
router.post(
  "/login",
  loginSchool
);

// VERIFY OTP
router.post(
  "/login/verify-otp",
  verifyLoginOtp
);
router.delete(
  "/logout",
  auth,
  logoutSchool
);
/*
==================================================
PROTECTED
==================================================
*/

router.get(
  "/profile",
  auth,
  getProfile
);

module.exports = router;