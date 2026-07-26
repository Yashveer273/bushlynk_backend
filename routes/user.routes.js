const router = require("express").Router();
const {
  auth,
  verifyParentToken,
} = require("../middlewares/school.auth");

const {
  createStudent,
  findSchoolsByParentPhone,
  sendOTP,
  verifyOTP,
  resendOTP,
  getStudentIdsByParentPhone,
  deleteChild,
  updateStudent,
  deleteParent,
  getParentsPagination,
  getChildById,
  getParentById,
  addChild,
  saveFcmToken,
  getLoggedInDevices,
  logoutDevice,
} = require("../controllers/user.controller");

/*
College authority creates parents directly.
No registration OTP, device ID, FCM token or parent JWT is required.

Body:
{
  "parent": {
    "name": "Rahul Sharma",
    "phone": "9876543210"
  },
  "child": [
    {
      "studentId": "STD001",
      "name": "Aryan Sharma",
      "class": "5",
      "section": "A",
      "rollNumber": "12",
      "busNumber": "",
      "pickupPointId": null
    }
  ]
}
*/
router.post("/create", auth, createStudent);

router.get(
  "/get-students-by-parent-phone/:phone",
  auth,
  getStudentIdsByParentPhone,
);

/* Public parent-login flow. */
router.post("/find-schools", findSchoolsByParentPhone);
router.post("/send-otp", sendOTP);
router.post("/verify-otp", verifyOTP);
router.post("/resend-otp", resendOTP);

/* College authority operations. */
router.put("/student/update/:parentId", auth, updateStudent);
router.post("/addChild/:parentId/child", auth, addChild);
router.delete("/student/delete/:parentId", auth, deleteParent);
router.delete(
  "/student/delete/:parentId/child/:childId",
  auth,
  deleteChild,
);
router.get("/parent/:parentId", auth, getParentById);
router.get("/parents", auth, getParentsPagination);
router.get(
  "/parent/:parentId/child/:childId",
  auth,
  getChildById,
);

/*
Parent session operations.
The parent/device identity comes only from the verified JWT.
*/
router.post(
  "/save-fcm-token",
  verifyParentToken,
  saveFcmToken,
);
router.get(
  "/logged-in-devices",
  verifyParentToken,
  getLoggedInDevices,
);
router.post(
  "/logout-current-device",
  verifyParentToken,
  logoutDevice,
);

/*
College authority session management.
Authority may inspect or remotely remove one selected device.
*/
router.get(
  "/:parentId/logged-in-devices",
  auth,
  getLoggedInDevices,
);
router.post(
  "/logout-device",
  auth,
  logoutDevice,
);

module.exports = router;
