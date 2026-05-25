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
} = require("../controllers/driver.controller");

/*
  Assign driver
*/
router.post("/createDriver",auth, createDriver);

/*
  Remove driver
*/
router.post("/remove", auth, removeDriver);

/*
  Get driver
*/
router.get("/getDriversBySchool", auth, getDriversBySchool);
router.get("/getDriverByBus", auth, getDriverByBus);
router.post("/startDriverJob",  startDriverJob);
router.post("/endDriverJob",  endDriverJob);

module.exports = router;
