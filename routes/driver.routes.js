const express = require("express");

const router = express.Router();
const {
  auth
} = require("../middlewares/school.auth");
const {
  createDriver,
  removeDriver,
  getDriversBySchool,
  getDriverByBus,
  startDriverJob,
  endDriverJob,
  driverLogin,
  getDriverLoginHistory,
  getDefaultAssignedBus,getDriverBusJobStatus
  
} = require("../controllers/driver.controller");

/*
  Assign driver
*/
router.post("/createDriver",auth, createDriver);
router.get(
  "/job-status/data/:schoolId/:driverId/:busNumber",
  getDriverBusJobStatus
);
/*
  Remove driver
*/
router.post("/remove", auth, removeDriver);

/*
  Get driver
*/
router.get("/getDriversBySchool", auth, getDriversBySchool);
router.get("/getDriverByBus", auth, getDriverByBus);
router.post("/login", driverLogin);


router.get(
  "/login-history",
  
  getDriverLoginHistory
);

router.post("/startDriverJob",  startDriverJob);
router.post("/endDriverJob",  endDriverJob);
router.post("/getDefaultAssignedBus",  getDefaultAssignedBus);

module.exports = router;
