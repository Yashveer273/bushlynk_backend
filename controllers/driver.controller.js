// controllers/driver.controller.js

const Driver = require("../models/Driver");
const Bus = require("../models/Bus");

/*
========================================
1. CREATE DRIVER
========================================
*/

exports.createDriver = async (req, res) => {
  try {
    /*
      ========================================
      SCHOOL FROM AUTH TOKEN
      ========================================
      */

    const schoolId = req.user.schoolId;

    /*
      ========================================
      BODY
      ========================================
      */

    const { driverId, name, phone, password } = req.body;

    /*
      ========================================
      VALIDATION
      ========================================
      */

    if (!driverId || !name || !phone || !password) {
      return res.status(400).json({
        success: false,

        message: "All fields are required",
      });
    }

    /*
      ========================================
      CHECK DUPLICATE
      ========================================
      */

    const existingDriver = await Driver.findOne({
      $or: [{ driverId }, { phone }],
    });

    if (existingDriver) {
      return res.status(409).json({
        success: false,

        message: "Driver already exists",
      });
    }

    /*
      ========================================
      CREATE DRIVER
      ========================================
      */

    const driver = await Driver.create({
      schoolId,
      driverId,
      name,
      phone,
      password,
      CurentJob: {
        busNumber: "",
        busAsignNumber: "",
        startedAt: null,
      },
    });

    return res.status(201).json({
      success: true,

      message: "Driver created successfully",

      data: driver,
    });
  } catch (err) {
    return res.status(500).json({
      success: false,

      error: err.message,
    });
  }
};

/*
========================================
2. REMOVE DRIVER
========================================
*/

exports.removeDriver = async (req, res) => {
  try {
    /*
      ========================================
      SCHOOL FROM AUTH
      ========================================
      */

    const schoolId = req.user.schoolId;

    const { driverId } = req.query;

    if (!driverId) {
      return res.status(400).json({
        success: false,

        message: "driverId required",
      });
    }

    /*
      ========================================
      FIND DRIVER
      ========================================
      */

    const driver = await Driver.findOne({
      schoolId,

      driverId,
    });

    if (!driver) {
      return res.status(404).json({
        success: false,

        message: "Driver not found",
      });
    }

    /*
      ========================================
      ACTIVE JOB CHECK
      ========================================
      */

    if (driver.CurentJob?.busNumber) {
      return res.status(400).json({
        success: false,

        message: "Driver currently on active trip",
      });
    }

    await Driver.deleteOne({
      schoolId,

      driverId,
    });

    return res.status(200).json({
      success: true,

      message: "Driver removed successfully",
    });
  } catch (err) {
    return res.status(500).json({
      success: false,

      error: err.message,
    });
  }
};

/*
========================================
3. GET DRIVERS BY SCHOOL
========================================
*/

exports.getDriversBySchool = async (req, res) => {
  try {
    /*
      ========================================
      SCHOOL FROM TOKEN
      ========================================
      */

    const schoolId = req.user.schoolId;

    /*
      ========================================
      GET DRIVERS
      ========================================
      */

    const drivers = await Driver.find({
      schoolId,
    });

    return res.status(200).json({
      success: true,

      total: drivers.length,

      data: drivers,
    });
  } catch (err) {
    return res.status(500).json({
      success: false,

      error: err.message,
    });
  }
};

/*
========================================
4. GET DRIVER BY BUS
========================================
*/

exports.getDriverByBus = async (req, res) => {
  try {
    const schoolId = req.user.schoolId;

    const { busNumber } = req.query;

    if (!busNumber) {
      return res.status(400).json({
        success: false,

        message: "busNumber required",
      });
    }

    /*
      ========================================
      FIND BUS
      ========================================
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
      ========================================
      CHECK DRIVER
      ========================================
      */

    if (!bus.driverlogin?.driverId) {
      return res.status(404).json({
        success: false,

        message: "No driver assigned",
      });
    }

    /*
      ========================================
      FIND DRIVER
      ========================================
      */

    const driver = await Driver.findOne({
      schoolId,

      driverId: bus.driverlogin.driverId,
    });

    if (!driver) {
      return res.status(404).json({
        success: false,

        message: "Driver record missing",
      });
    }

    return res.status(200).json({
      success: true,

      data: driver,
    });
  } catch (err) {
    return res.status(500).json({
      success: false,

      error: err.message,
    });
  }
};

/*
========================================
5. START DRIVER JOB
========================================

BODY:
{
  "schoolId": "SCH001",
  "driverId": "D001",
  "password": "1234",
  "busNumber": "BUS101"
}
*/
exports.startDriverJob = async (req, res) => {
  try {
    const { schoolId, driverId, password, busNumber } = req.body;

    /*
    ========================================
    VALIDATE INPUTS
    ========================================
    */

    if (!schoolId || !driverId || !password || !busNumber) {
      return res.status(400).json({
        success: false,
        message: "All fields are required",
      });
    }

    /*
    ========================================
    VALIDATE DRIVER
    ========================================
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
    ========================================
    DRIVER ALREADY ACTIVE
    ========================================
    */

    if (driver.CurentJob?.busNumber) {
      return res.status(400).json({
        success: false,
        message: "Driver already on active trip",
      });
    }

    /*
    ========================================
    FIND BUS
    ========================================
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
    ========================================
    BUS ALREADY OCCUPIED
    ========================================
    */

    if (bus.driverlogin?.driverId) {
      return res.status(400).json({
        success: false,
        message: "Bus already occupied",
      });
    }

    /*
    ========================================
    ASSIGN DRIVER TO BUS
    ========================================
    */

    bus.driverlogin = {
      driverId: driver.driverId,

      driverName: driver.name,

      assignedAt: new Date(),
    };

    bus.status.tripStarted = true;

    await bus.save();

    /*
    ========================================
    SAVE DRIVER CURRENT JOB
    ========================================
    */

    driver.CurentJob = {
      schoolId,

      busNumber: bus.busNumber,

      busAsignNumber: bus.busAsignNumber,

      startedAt: new Date(),
    };

    await driver.save();

    return res.status(200).json({
      success: true,
      message: "Driver job started",

      data: {
        driver,
        bus,
      },
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      error: err.message,
    });
  }
};

/*
========================================
6. END DRIVER JOB
========================================
*/
exports.endDriverJob = async (req, res) => {
  try {
    const { driverId } = req.body;

    if (!driverId) {
      return res.status(400).json({
        success: false,
        message: "driverId required",
      });
    }

    /*
    ========================================
    FIND DRIVER
    ========================================
    */

    const driver = await Driver.findOne({ driverId });

    if (!driver) {
      return res.status(404).json({
        success: false,
        message: "Driver not found",
      });
    }

    /*
    ========================================
    CHECK ACTIVE JOB
    ========================================
    */

    if (!driver.CurentJob?.busNumber) {
      return res.status(400).json({
        success: false,
        message: "No active trip",
      });
    }

    /*
    ========================================
    FIND BUS
    ========================================
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
    ========================================
    CLEAR DRIVER JOB
    ========================================
    */

    driver.CurentJob = {};

    await driver.save();

    return res.status(200).json({
      success: true,
      message: "Driver job ended",
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      error: err.message,
    });
  }
};
