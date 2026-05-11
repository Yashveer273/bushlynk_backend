const express = require("express");

const router = express.Router();

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
router.post("/createDriver", createDriver);

/*
  Remove driver
*/
router.post("/remove", removeDriver);

/*
  Get driver
*/
router.get("/getDriversBySchool", getDriversBySchool);
router.get("/getDriverByBus", getDriverByBus);
router.post("/startDriverJob", startDriverJob);
router.post("/endDriverJob", endDriverJob);

module.exports = router;
