const router = require("express").Router();

const {
  sendOTP,
  verifyOTP,
  resendOTP,
  saveFcmToken
} = require("../controllers/user.controller");

// OTP-based parent login
router.post("/send-otp", sendOTP);
router.post("/verify-otp", verifyOTP);
router.post("/resend-otp", resendOTP);
router.post(
  "/save-fcm-token",
  saveFcmToken
);
module.exports = router;