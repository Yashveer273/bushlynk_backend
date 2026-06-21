const router = require("express").Router();
const { auth } = require("../middlewares/school.auth");

const {


  sendRegisterOTP,
  verifyRegisterOTP,
  createStudent,

 

  sendOTP,
  verifyOTP,
  resendOTP,

 
deleteChild,
  updateStudent,
  deleteParent,
getParentsPagination,
getChildById,
getParentById,
addChild,
  saveFcmToken,

} = require("../controllers/user.controller");

/*
================================================================================
1. SEND REGISTER OTP
================================================================================

API:
POST http://localhost:3000/api/student/send-register-otp

DATA TO PASS:
{
  "schoolId": "SCH001",
  "parentPhone": "9876543210"
}

FLOW:
1. Check school exists
2. Check phone already registered
3. If already registered:
      return error
4. Generate OTP
5. Save OTP
6. Send OTP
*/

router.post(
  "/send-register-otp",auth,
  sendRegisterOTP
);

/*
================================================================================
2. VERIFY REGISTER OTP
================================================================================

API:
POST http://localhost:3000/api/student/verify-register-otp

DATA TO PASS:
{
  "parentPhone": "9876543210",
  "otp": "123456"
}

FLOW:
1. Find saved OTP
2. Compare OTP
3. If matched:
      verified = true
4. Allow create student
*/

router.post(
  "/verify-register-otp",auth,
  verifyRegisterOTP
);

/*
================================================================================
3. CREATE STUDENT
================================================================================

API:
POST http://localhost:3000/api/student/create

DATA TO PASS:
{
  "schoolId": "SCH001",

  "parent": {
    "name": "Rahul Sharma",
    "phone": "9876543210"
  },

  "child": {
    "studentId": "STD001",
    "name": "Aryan Sharma",
    "class": "5",
    "section": "A",
    "rollNumber": "12"
  },

  "busNumber": "BUS-12",

  "pickupPointId": "PICK001"
}

FLOW:
1. Validate fields
2. Check duplicate student
3. Generate userId
4. Save student
*/

router.post(
  "/create",auth,
  createStudent
);

/*
================================================================================
4. SEND LOGIN OTP
================================================================================

API:
POST /api/v1/user/send-otp

DATA TO PASS:
{
  "schoolId": "SCH001",
  "parentPhone": "9876543210"
}

FLOW:
1. Find registered parent
2. Generate OTP
3. Save OTP
4. Send OTP
*/

router.post(
  "/send-otp",
    auth,
  sendOTP
);

/*
================================================================================
5. VERIFY LOGIN OTP
================================================================================

API:
POST /api/v1/user/verify-otp

DATA TO PASS:
{
  "schoolId": "SCH001",
  "parentPhone": "9876543210",
  "otp": "123456"
}

FLOW:
1. Compare OTP
2. Login success
3. Return student data
*/

router.post(
  "/verify-otp",auth,
  verifyOTP
);

/*
================================================================================
6. RESEND LOGIN OTP
================================================================================

API:
POST /api/v1/user/resend-otp

DATA TO PASS:
{
  "schoolId": "SCH001",
  "parentPhone": "9876543210"
}

FLOW:
1. Find user
2. Generate new OTP
3. Save OTP
4. Send OTP
*/

router.post(
  "/resend-otp",auth,
  resendOTP
);

/*
================================================================================
7. UPDATE STUDENT
================================================================================

API:
PUT /api/v1/user/student/update/:parentId

PARAM:
parentId = PAR001

DATA TO PASS:
{
  "parent": {
    "name": "Rahul Sharma Updated",
    "phone": "9999999999"
  },

  "child": {
    "studentId": "STD001",
    "name": "Aryan Sharma Updated",
    "class": "6",
    "section": "B",
    "rollNumber": "20"
  },

  "busNumber": "BUS-15",

  "pickupPointId": "PICK009"
}

FLOW:
1. Find student
2. Update parent
3. Update child
4. Update bus
5. Save updated data
*/

router.put(
  "/student/update/:parentId",auth,
  updateStudent
);
router.post(
  "/addChild/:parentId/child",
  auth,
  addChild
);
/*
================================================================================
8. DELETE STUDENT
================================================================================

API:
DELETE /api/v1/user/student/delete/:parentId

PARAM:
parentId = PAR001

FLOW:
1. Find student
2. Delete student
*/

router.delete(
  "/student/delete/:parentId/",auth,
  deleteParent
);
router.delete(
  "/student/delete/:parentId/child/:childId",
  auth,
  deleteChild
);
/*
================================================================================
9. SAVE FCM TOKEN
================================================================================

API:
POST /api/v1/user/save-fcm-token

DATA TO PASS:
{
  "parentId": "PAR001",
  "fcmToken": "firebase_token_here"
}

FLOW:
1. Find user
2. Save FCM token
3. Enable notifications
*/

router.post(
  "/save-fcm-token",auth,
  saveFcmToken
);

/*
================================================================================
10. GET PARENT BY ID
================================================================================
*/

router.get(
  "/parent/:parentId",auth,
  getParentById
);

/*
================================================================================
11. GET PARENTS PAGINATION
================================================================================
*/

router.get(
  "/parents",auth,
  getParentsPagination
);

/*
================================================================================
12. GET SINGLE CHILD
================================================================================
*/

router.get(
  "/parent/:parentId/child/:childId",auth,
  getChildById
);

module.exports = router;