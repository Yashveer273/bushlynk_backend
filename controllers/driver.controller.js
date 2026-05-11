

const Driver = require("../models/Driver");
const Bus = require("../models/Bus");

exports.createDriver = async (req, res) => {
  try {

    const {
      driverId,
      schoolId,
      name,
      phone,
      password,
    } = req.body;

    /*
      Check existing driver
    */
    const existingDriver = await Driver.findOne({
      $or: [
        { driverId },
        { phone },
      ],
    });

    if (existingDriver) {
      return res.status(409).json({
        success: false,
        message: "Driver already exists",
      });
    }

    /*
      Create driver
    */
    const driver = await Driver.create({
      driverId,
      schoolId,
      name,
      phone,
      password,

      CurentJob: {},
    });

    res.status(201).json({
      success: true,
      message: "Driver created successfully",
      data: driver,
    });

  } catch (err) {

    /*
      Mongo duplicate key
    */
    if (err.code === 11000) {
      return res.status(409).json({
        success: false,
        message: "Duplicate driver entry",
      });
    }

    res.status(500).json({
      success: false,
      error: err.message,
    });

  }
};


/*
========================================
REMOVE DRIVER
========================================
*/
exports.removeDriver = async (req, res) => {
  try {

    const { driverId } = req.query;

    const driver = await Driver.findOne({ driverId });

    if (!driver) {
      return res.status(404).json({
        success: false,
        message: "Driver not found",
      });
    }

    /*
      Prevent delete if active job
    */
    if (driver.CurentJob?.busNumber) {
      return res.status(400).json({
        success: false,
        message: "Driver currently on active job",
      });
    }

    await Driver.deleteOne({ driverId });

    res.status(200).json({
      success: true,
      message: "Driver removed successfully",
    });

  } catch (err) {

    res.status(500).json({
      success: false,
      error: err.message,
    });

  }
};


/*
========================================
GET DRIVERS BY SCHOOL ID
========================================
*/
exports.getDriversBySchool = async (req, res) => {
  try {

    const { schoolId } = req.query;

    const drivers = await Driver.find({
      schoolId,
    });

    res.status(200).json({
      success: true,
      total: drivers.length,
      data: drivers,
    });

  } catch (err) {

    res.status(500).json({
      success: false,
      error: err.message,
    });

  }
};


/*
========================================
GET DRIVER BY BUS NUMBER
========================================
*/
exports.getDriverByBus = async (req, res) => {
  try {

    const { busNumber } = req.query;

    /*
      Find bus
    */
    const bus = await Bus.findOne({
      busNumber,
    });

    if (!bus) {
      return res.status(404).json({
        success: false,
        message: "Bus not found",
      });
    }

    /*
      Check assigned driver
    */
    if (!bus.driverlogin?.driverId) {
      return res.status(404).json({
        success: false,
        message: "No driver assigned",
      });
    }

    /*
      Find driver
    */
    const driver = await Driver.findOne({
      driverId: bus.driverlogin.driverId,
    });

    if (!driver) {
      return res.status(404).json({
        success: false,
        message: "Driver record missing",
      });
    }

    res.status(200).json({
      success: true,
      data: driver,
    });

  } catch (err) {

    res.status(500).json({
      success: false,
      error: err.message,
    });

  }
};


/*
========================================
START DRIVER JOB
========================================
{
  "schoolId": "SCH001",
  "driverId": "D001",
  "password": "1234",
  "busNumber": "BUS101"
}
*/
exports.startDriverJob = async (req, res) => {
  try {

    const {
      schoolId,
      driverId,
      password,
      busNumber,
    } = req.body;

    /*
      Validate driver
    */
    const driver = await Driver.findOne({
      schoolId,
      driverId,
      password,
    });

    if (!driver) {
      return res.status(401).json({
        success: false,
        message: "Invalid credentials",
      });
    }

    /*
      Already on job
    */
    if (driver.CurentJob?.busNumber) {
      return res.status(400).json({
        success: false,
        message: "Driver already on active trip",
      });
    }

    /*
      Find bus using UNIQUE busNumber
    */
    const bus = await Bus.findOne({
      schoolId,
      busNumber,
    });

    if (!bus) {
      return res.status(404).json({
        success: false,
        message: "Bus not found",
      });
    }

    /*
      Check bus already assigned
    */
    if (bus.driverlogin?.driverId) {
      return res.status(400).json({
        success: false,
        message: "Bus already occupied",
      });
    }

    /*
      Save in bus schema
    */
    bus.driverlogin = {
      driverId: driver.driverId,
      driverName: driver.name,
      assignedAt: new Date(),
    };

    bus.status.tripStarted = true;

    await bus.save();

    /*
      Save in driver schema

      busAsignNumber is only
      for dashboard/log display
    */
    driver.CurentJob = {
      busNumber: bus.busNumber,
      busNumber: bus.busNumber,
      busAsignNumber: bus.busAsignNumber,
    };

    await driver.save();

    res.status(200).json({
      success: true,
      message: "Driver job started",

      data: {
        driver,
        bus,
      },
    });

  } catch (err) {

    res.status(500).json({
      success: false,
      error: err.message,
    });

  }
};


/*
========================================
END DRIVER JOB
========================================
*/
exports.endDriverJob = async (req, res) => {
  try {

    const { driverId } = req.body;

    const driver = await Driver.findOne({
      driverId,
    });

    if (!driver) {
      return res.status(404).json({
        success: false,
        message: "Driver not found",
      });
    }

    /*
      Check active job
    */
    if (!driver.CurentJob?.busNumber) {
      return res.status(400).json({
        success: false,
        message: "No active trip",
      });
    }

    /*
      Find bus using UNIQUE busNumber
    */
    const bus = await Bus.findOne({
      busNumber: driver.CurentJob.busNumber,
    });

    if (bus) {

      bus.driverlogin = {};

      bus.status.tripStarted = false;

      await bus.save();
    }

    /*
      Clear driver job
    */
    driver.CurentJob = {};

    await driver.save();

    res.status(200).json({
      success: true,
      message: "Driver job ended",
    });

  } catch (err) {

    res.status(500).json({
      success: false,
      error: err.message,
    });

  }
};