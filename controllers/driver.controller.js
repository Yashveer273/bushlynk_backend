// controllers/driver.controller.js

const Driver = require("../models/Driver");
const Bus = require("../models/Bus");
const {db } = require("../config/firebase");
const jwt = require("jsonwebtoken");
const secret = "0000000";
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
exports.getDriverLoginHistory = async (req, res) => {
  try {
    const { schoolId, driverId, phone } = req.body;

    /*
    ========================================
    VALIDATION
    ========================================
    */

    if (!schoolId) {
      return res.status(400).json({
        success: false,
        message: "School ID is required",
      });
    }

    if (!driverId && !phone) {
      return res.status(400).json({
        success: false,
        message: "Driver ID or Phone is required",
      });
    }

    /*
    ========================================
    BUILD QUERY (STRICT SCHOOL ISOLATION)
    ========================================
    */

    const query = {
      schoolId: schoolId.trim(),
    };

    if (driverId && phone) {
      query.driverId = driverId.trim();
      query.phone = phone.trim();
    } else if (driverId) {
      query.driverId = driverId.trim();
    } else {
      query.phone = phone.trim();
    }

    /*
    ========================================
    FIND DRIVER
    ========================================
    */

    const driver = await Driver.findOne(query).select(
      "schoolId driverId name phone loginHistory",
    );

    if (!driver) {
      return res.status(404).json({
        success: false,
        message: "Driver not found for this school with provided details",
      });
    }

    /*
    ========================================
    FILTER LAST 30 DAYS HISTORY
    ========================================
    */

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const loginHistory = driver.loginHistory
      .filter((entry) => new Date(entry.loginAt) >= thirtyDaysAgo)
      .sort((a, b) => new Date(b.loginAt) - new Date(a.loginAt));

    /*
    ========================================
    RESPONSE
    ========================================
    */

    return res.status(200).json({
      success: true,
      data: {
        schoolId: driver.schoolId,
        driverId: driver.driverId,
        name: driver.name,
        phone: driver.phone,
        totalLogins: loginHistory.length,
        loginHistory,
      },
    });
  } catch (error) {
    console.error("Login History Error:", error);

    return res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
};

exports.driverLogin = async (req, res) => {
  try {
    const { schoolId, phone } = req.body;

    /*
    ========================================
    VALIDATION
    ========================================
    */
    if (!schoolId) {
      return res.status(400).json({
        success: false,
        message: "School ID is required",
      });
    }

    if (!phone) {
      return res.status(400).json({
        success: false,
        message: "Phone is required",
      });
    }

    /*
    ========================================
    FIND DRIVER (OPTIMIZED QUERY)
    ========================================
    */
    const driver = await Driver.findOne({
      schoolId,
      phone,
    });

    if (!driver) {
      return res.status(404).json({
        success: false,
        message: "Driver not found for this school",
      });
    }

    /*
    ========================================
    REMOVE OLD LOGIN HISTORY (30 DAYS)
    ========================================
    */
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    driver.loginHistory = driver.loginHistory.filter(
      (item) => new Date(item.loginAt) >= thirtyDaysAgo,
    );

    /*
    ========================================
    CLOSE PREVIOUS SESSION
    ========================================
    */
    const openSession = [...driver.loginHistory]
      .reverse()
      .find((item) => !item.logoutAt);

    if (openSession) {
      openSession.logoutAt = new Date();
    }

    /*
    ========================================
    GENERATE JWT TOKEN
    ========================================
    */
    const token = jwt.sign(
      {
        id: driver._id,
        driverId: driver.driverId,
        schoolId: driver.schoolId,
        tokenVersion: driver.tokenVersion,
      },
      secret,
      {
        expiresIn: "30d",
      },
    );

    /*
    ========================================
    SAVE TOKEN
    ========================================
    */
    driver.token = token;

    /*
    ========================================
    ADD LOGIN HISTORY
    ========================================
    */
    driver.loginHistory.push({
      loginAt: new Date(),
      logoutAt: null,
      ipAddress:
        req.headers["x-forwarded-for"] || req.socket.remoteAddress || "",
      deviceInfo: req.headers["user-agent"] || "",
    });

    await driver.save();

    /*
    ========================================
    RESPONSE
    ========================================
    */
    return res.status(200).json({
      success: true,
      message: "Login successful",
      token,
      driver: {
        id: driver._id,
        driverId: driver.driverId,
        schoolId: driver.schoolId,
        name: driver.name,
        phone: driver.phone,
        CurentJob: driver.CurentJob,
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: error.message,
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

// START / SWITCH BUS
exports.startDriverJob = async (req, res) => {
  try {
    const { schoolId, driverId, password, busNumber } = req.body;

    if (!schoolId || !driverId || !password || !busNumber) {
      return res.status(400).json({
        success: false,
        message: "schoolId, driverId, password and busNumber are required",
      });
    }

    const driver = await Driver.findOne({
      schoolId,
      driverId,
      password,
    }).select("driverId schoolId name phone CurentJob defaultAsignBusNumber");

    if (!driver) {
      return res.status(401).json({
        success: false,
        message: "Invalid credentials",
      });
    }

    const bus = await Bus.findOne({ schoolId, busNumber })
      .select("schoolId busNumber busAsignNumber driverlogin status");

    if (!bus) {
      return res.status(404).json({
        success: false,
        message: "Bus not found",
      });
    }

    // ✅ 1. Check Firebase bus occupation
    const firebaseBusRef = db
      .ref(`busJobs/${schoolId}/${busNumber}`);

    const firebaseBusSnap = await firebaseBusRef.once("value");
    const firebaseBusData = firebaseBusSnap.val();

    if (
      firebaseBusData?.isOccupied === true &&
      firebaseBusData?.driverId !== driverId
    ) {
      return res.status(400).json({
        success: false,
        message: "Bus already occupied. Please select another bus.",
        isOccupied: true,
        occupiedByMe: false,
        stopRequired: false,
      });
    }

    // ✅ 2. Check MongoDB bus occupation
    if (
      bus.driverlogin?.driverId &&
      bus.driverlogin.driverId !== driverId
    ) {
      return res.status(400).json({
        success: false,
        message: "Bus already occupied in bus schema. Please select another bus.",
        isOccupied: true,
        occupiedByMe: false,
        stopRequired: false,
      });
    }

    // ✅ If same bus already occupied by same driver
    if (
      firebaseBusData?.isOccupied === true &&
      firebaseBusData?.driverId === driverId
    ) {
      return res.status(400).json({
        success: false,
        message: "This bus is already occupied by you. Please stop this bus first.",
        isOccupied: true,
        occupiedByMe: true,
        stopRequired: true,
      });
    }

    const startedAt = new Date();

    // ✅ 3. Occupy selected bus in MongoDB
    bus.driverlogin = {
      driverId: driver.driverId,
      driverName: driver.name,
      assignedAt: startedAt,
    };

    bus.status = {
      ...(bus.status || {}),
      active: true,
      tripStarted: true,
    };

    await bus.save();

    // ✅ 4. Replace only driver's current job with latest selected bus
    driver.CurentJob = {
      schoolId,
      busNumber: bus.busNumber,
      busAsignNumber: bus.busAsignNumber,
      startedAt,
    };

    await driver.save();

    // ✅ 5. Create/update per-bus Firebase record
    await firebaseBusRef.update({
      isOccupied: true,
      schoolId,
      driverId: driver.driverId,
      driverName: driver.name,
      phone: driver.phone,
      busNumber: bus.busNumber,
      busAsignNumber: bus.busAsignNumber,
      startedAt: startedAt.toISOString(),
      endedAt: null,
      updatedAt: new Date().toISOString(),
    });

    // ✅ 6. Update driver's latest current job in Firebase
    await db
      .ref(`driverJobs/${schoolId}/${driver.driverId}`)
      .update({
        isJobActive: true,
        schoolId,
        driverId: driver.driverId,
        driverName: driver.name,
        phone: driver.phone,
        currentBusNumber: bus.busNumber,
        currentBusAsignNumber: bus.busAsignNumber,
        startedAt: startedAt.toISOString(),
        endedAt: null,
        updatedAt: new Date().toISOString(),
      });

    return res.status(200).json({
      success: true,
      message: "Bus started successfully",
      data: {
        isJobActive: true,
        busNumber: bus.busNumber,
        busAsignNumber: bus.busAsignNumber,
        driverId: driver.driverId,
        driverName: driver.name,
        startedAt,
      },
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: "Start driver job failed",
      error: err.message,
    });
  }
};


// STOP SELECTED BUS
exports.endDriverJob = async (req, res) => {
  try {
    const { schoolId, driverId, password, busNumber } = req.body;

    if (!schoolId || !driverId || !password || !busNumber) {
      return res.status(400).json({
        success: false,
        message: "schoolId, driverId, password and busNumber are required",
      });
    }

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

    const firebaseBusRef = db
      .ref(`busJobs/${schoolId}/${busNumber}`);

    const firebaseBusSnap = await firebaseBusRef.once("value");
    const firebaseBusData = firebaseBusSnap.val();

    if (!firebaseBusData || firebaseBusData.isOccupied !== true) {
      return res.status(400).json({
        success: false,
        message: "This bus is not active",
      });
    }

    if (firebaseBusData.driverId !== driverId) {
      return res.status(403).json({
        success: false,
        message: "This bus is occupied by another driver",
      });
    }

    const endedAt = new Date();

    // ✅ Stop selected bus in MongoDB
    const bus = await Bus.findOne({
      schoolId,
      busNumber,
      "driverlogin.driverId": driverId,
    });

    if (bus) {
      bus.driverlogin = {};
      bus.status = {
        ...(bus.status || {}),
        tripStarted: false,
      };
      await bus.save();
    }

    // ✅ Stop selected bus in Firebase
    await firebaseBusRef.update({
      isOccupied: false,
      endedAt: endedAt.toISOString(),
      updatedAt: new Date().toISOString(),
    });

    // ✅ Clear current job only if current job is this selected bus
    if (driver.CurentJob?.busNumber === busNumber) {
      driver.CurentJob = {};
      await driver.save();

      await db
        .ref(`driverJobs/${schoolId}/${driverId}`)
        .update({
          isJobActive: false,
          currentBusNumber: null,
          currentBusAsignNumber: null,
          endedAt: endedAt.toISOString(),
          updatedAt: new Date().toISOString(),
        });
    }

    return res.status(200).json({
      success: true,
      message: "Selected bus stopped successfully",
      data: {
        busNumber,
        stoppedBy: driverId,
        endedAt,
      },
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: "Stop driver job failed",
      error: err.message,
    });
  }
};


// GET SELECTED BUS STATUS
exports.getDriverBusJobStatus = async (req, res) => {
  try {
    const { schoolId, driverId, busNumber } = req.params;

    if (!schoolId || !driverId || !busNumber) {
      return res.status(400).json({
        success: false,
        message: "schoolId, driverId and busNumber are required",
      });
    }

    const bus = await Bus.findOne({ schoolId, busNumber })
      .select("busNumber busAsignNumber driverlogin status");

    if (!bus) {
      return res.status(404).json({
        success: false,
        message: "Bus not found",
      });
    }

    const firebaseBusSnap = await db
      .ref(`busJobs/${schoolId}/${busNumber}`)
      .once("value");

    const firebaseBusData = firebaseBusSnap.val();

    const firebaseOccupied = firebaseBusData?.isOccupied === true;
    const mongoOccupied = !!bus.driverlogin?.driverId;

    const occupiedDriverId =
      firebaseBusData?.driverId || bus.driverlogin?.driverId || null;

    const isOccupied = firebaseOccupied || mongoOccupied;
    const occupiedByMe = occupiedDriverId === driverId;

    return res.status(200).json({
      success: true,
      isOccupied,
      occupiedByMe,
      stopRequired: isOccupied && occupiedByMe,
      message: !isOccupied
        ? "Bus is free"
        : occupiedByMe
        ? "Bus is occupied by you. You can stop this bus."
        : "Bus is occupied by another driver.",
      data: {
        busNumber,
        busAsignNumber: bus.busAsignNumber,
        occupiedDriverId,
        firebase: firebaseBusData || null,
        mongo: {
          driverlogin: bus.driverlogin || {},
          status: bus.status || {},
        },
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Bus status fetch failed",
      error: error.message,
    });
  }
};
exports.getDefaultAssignedBus = async (req, res) => {
  try {

    const { driverId, schoolId } = req.body;

    if (!schoolId || !driverId) {
      return res.status(400).json({
        success: false,
        message: "schoolId and driverId are required",
      });
    }
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

    if (!driver.defaultAsignBusNumber) {
      return res.status(404).json({
        success: false,
        message: "No default bus assigned to this driver",
      });
    }
    const buses = await Bus.findOne({
      schoolId,
    }).select({
      busNumber: 1,
      busAsignNumber: 1,
      defaultAsignDriver: 1,
    });

    if (!buses) {
      return res.status(404).json({
        success: false,
        message: "Assigned bus not found",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Default assigned bus fetched successfully",
      data: {
        driver: {
          driverId: driver.driverId,
          name: driver.name,
          phone: driver.phone,
          defaultAsignBusNumber: driver.defaultAsignBusNumber,
        },
        buses,
      },
    });
  } catch (err) {
    console.log("Get default assigned bus error:", err);

    return res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};
