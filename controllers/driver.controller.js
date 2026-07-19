// controllers/driver.controller.js
"use strict";

const Driver = require("../models/Driver");
const Bus = require("../models/Bus");
const { db } = require("../config/firebase");
const jwt = require("jsonwebtoken");

const JWT_SECRET  = "0000000";

const DRIVER_SAFE_FIELDS =
  "driverId schoolId name phone defaultAsignBusNumber CurentJob createdAt updatedAt";

const normalize = (value) =>
  typeof value === "string" ? value.trim() : value;

const getClientIp = (req) => {
  const forwarded = req.headers["x-forwarded-for"];

  if (typeof forwarded === "string" && forwarded.length > 0) {
    return forwarded.split(",")[0].trim();
  }

  return req.socket?.remoteAddress || "";
};

const serverError = (res, message, error) =>
  res.status(500).json({
    success: false,
    message,
    error:
      process.env.NODE_ENV === "production"
        ? undefined
        : error?.message || "Unknown error",
  });

const createPerformanceTracker = () => {
  const controllerStartedAt = performance.now();
  const timings = {};

  const measure = async (name, operation) => {
    const startedAt = performance.now();

    try {
      return await operation();
    } finally {
      timings[name] = Number(
        (performance.now() - startedAt).toFixed(2),
      );
    }
  };

  const mark = (name, startedAt) => {
    timings[name] = Number(
      (performance.now() - startedAt).toFixed(2),
    );
  };

  const finish = () => {
    timings.controllerTotal = Number(
      (performance.now() - controllerStartedAt).toFixed(2),
    );

    return timings;
  };

  return {
    timings,
    measure,
    mark,
    finish,
  };
};
/* =========================================================
   CREATE DRIVER
   Existing mobile/admin contract preserved:
   body: { driverId, name, phone, password }
   schoolId comes from req.user.schoolId
========================================================= */
exports.createDriver = async (req, res) => {
  try {
    const schoolId = normalize(req.user?.schoolId);
    const driverId = normalize(req.body.driverId);
    const name = normalize(req.body.name);
    const phone = normalize(req.body.phone);
    const password = normalize(req.body.password);

    if (!schoolId) {
      return res.status(401).json({
        success: false,
        message: "School authentication required",
      });
    }

    if (!driverId || !name || !phone || !password) {
      return res.status(400).json({
        success: false,
        message: "All fields are required",
      });
    }

    // One insert instead of duplicate-read + insert.
    // Unique indexes remain the final protection against race conditions.
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

    const safeDriver = {
      _id: driver._id,
      schoolId: driver.schoolId,
      driverId: driver.driverId,
      name: driver.name,
      phone: driver.phone,
      defaultAsignBusNumber: driver.defaultAsignBusNumber,
      CurentJob: driver.CurentJob,
      createdAt: driver.createdAt,
      updatedAt: driver.updatedAt,
    };

    return res.status(201).json({
      success: true,
      message: "Driver created successfully",
      data: safeDriver,
    });
  } catch (error) {
    if (error?.code === 11000) {
      const field = Object.keys(error.keyPattern || {})[0] || "driver";
      return res.status(409).json({
        success: false,
        message: `${field} already exists`,
      });
    }

    return serverError(res, "Create driver failed", error);
  }
};

/* =========================================================
   REMOVE DRIVER
   Existing contract:
   query: ?driverId=...
========================================================= */
exports.removeDriver = async (req, res) => {
  try {
    const schoolId = normalize(req.user?.schoolId);
    const driverId = normalize(req.query.driverId);

    if (!schoolId) {
      return res.status(401).json({
        success: false,
        message: "School authentication required",
      });
    }

    if (!driverId) {
      return res.status(400).json({
        success: false,
        message: "driverId required",
      });
    }

    // Atomic delete only when no active bus exists.
    const deletedDriver = await Driver.findOneAndDelete({
      schoolId,
      driverId,
      $or: [
        { "CurentJob.busNumber": "" },
        { "CurentJob.busNumber": null },
        { "CurentJob.busNumber": { $exists: false } },
      ],
    })
      .select("_id")
      .lean();

    if (deletedDriver) {
      return res.status(200).json({
        success: true,
        message: "Driver removed successfully",
      });
    }

    const driverState = await Driver.findOne({ schoolId, driverId })
      .select("_id CurentJob.busNumber")
      .lean();

    if (!driverState) {
      return res.status(404).json({
        success: false,
        message: "Driver not found",
      });
    }

    return res.status(400).json({
      success: false,
      message: "Driver currently on active trip",
      activeBusNumber: driverState.CurentJob?.busNumber || null,
    });
  } catch (error) {
    return serverError(res, "Remove driver failed", error);
  }
};

/* =========================================================
   GET DRIVERS BY SCHOOL
   Existing route is protected by school auth.
   Optional pagination added without breaking old calls:
   ?page=1&limit=100&search=
========================================================= */
exports.getDriversBySchool = async (req, res) => {
  try {
    const schoolId = normalize(req.user?.schoolId);
    const page = Math.max(Number.parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(
      Math.max(Number.parseInt(req.query.limit, 10) || 100, 1),
      500,
    );
    const search = normalize(req.query.search || "");

    if (!schoolId) {
      return res.status(401).json({
        success: false,
        message: "School authentication required",
      });
    }

    const filter = { schoolId };

    if (search) {
      const escaped = search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      filter.$or = [
        { driverId: { $regex: escaped, $options: "i" } },
        { name: { $regex: escaped, $options: "i" } },
        { phone: { $regex: escaped, $options: "i" } },
      ];
    }

    const skip = (page - 1) * limit;

    const [drivers, total] = await Promise.all([
      Driver.find(filter)
        .select(DRIVER_SAFE_FIELDS)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Driver.countDocuments(filter),
    ]);

    return res.status(200).json({
      success: true,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      data: drivers,
    });
  } catch (error) {
    return serverError(res, "Get drivers failed", error);
  }
};

/* =========================================================
   GET DRIVER BY BUS
   query: ?busNumber=...
========================================================= */
exports.getDriverByBus = async (req, res) => {
  try {
    const schoolId = normalize(req.user?.schoolId);
    const busNumber = normalize(req.query.busNumber);

    if (!schoolId) {
      return res.status(401).json({
        success: false,
        message: "School authentication required",
      });
    }

    if (!busNumber) {
      return res.status(400).json({
        success: false,
        message: "busNumber required",
      });
    }

    const bus = await Bus.findOne({ schoolId, busNumber })
      .select("driverlogin.driverId")
      .lean();

    if (!bus) {
      return res.status(404).json({
        success: false,
        message: "Bus not found",
      });
    }

    const assignedDriverId = bus.driverlogin?.driverId;

    if (!assignedDriverId) {
      return res.status(404).json({
        success: false,
        message: "No driver assigned",
      });
    }

    const driver = await Driver.findOne({
      schoolId,
      driverId: assignedDriverId,
    })
      .select(DRIVER_SAFE_FIELDS)
      .lean();

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
  } catch (error) {
    return serverError(res, "Get driver by bus failed", error);
  }
};

/* =========================================================
   LOGIN HISTORY
   Existing route is GET but old controller reads req.body.
   This version supports BOTH body and query for app/web safety.
========================================================= */
exports.getDriverLoginHistory = async (req, res) => {
  try {
    const schoolId = normalize(req.body.schoolId || req.query.schoolId);
    const driverId = normalize(req.body.driverId || req.query.driverId);
    const phone = normalize(req.body.phone || req.query.phone);

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

    const match = {
      schoolId,
      ...(driverId ? { driverId } : {}),
      ...(phone ? { phone } : {}),
    };

    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    // Filter/sort history inside MongoDB so large arrays are not fully sent.
    const result = await Driver.aggregate([
      { $match: match },
      {
        $project: {
          _id: 0,
          schoolId: 1,
          driverId: 1,
          name: 1,
          phone: 1,
          loginHistory: {
            $filter: {
              input: "$loginHistory",
              as: "entry",
              cond: { $gte: ["$$entry.loginAt", thirtyDaysAgo] },
            },
          },
        },
      },
      {
        $set: {
          loginHistory: {
            $sortArray: {
              input: "$loginHistory",
              sortBy: { loginAt: -1 },
            },
          },
        },
      },
    ]);

    const driver = result[0];

    if (!driver) {
      return res.status(404).json({
        success: false,
        message: "Driver not found for this school with provided details",
      });
    }

    return res.status(200).json({
      success: true,
      data: {
        ...driver,
        totalLogins: driver.loginHistory.length,
      },
    });
  } catch (error) {
    // $sortArray requires MongoDB 5.2+. Fallback for older MongoDB.
    if (error?.codeName === "InvalidPipelineOperator") {
      try {
        const schoolId = normalize(req.body.schoolId || req.query.schoolId);
        const driverId = normalize(req.body.driverId || req.query.driverId);
        const phone = normalize(req.body.phone || req.query.phone);
        const query = {
          schoolId,
          ...(driverId ? { driverId } : {}),
          ...(phone ? { phone } : {}),
        };

        const driver = await Driver.findOne(query)
          .select("schoolId driverId name phone loginHistory")
          .lean();

        if (!driver) {
          return res.status(404).json({
            success: false,
            message: "Driver not found for this school with provided details",
          });
        }

        const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
        const loginHistory = (driver.loginHistory || [])
          .filter((item) => new Date(item.loginAt).getTime() >= cutoff)
          .sort(
            (a, b) =>
              new Date(b.loginAt).getTime() - new Date(a.loginAt).getTime(),
          );

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
      } catch (fallbackError) {
        return serverError(
          res,
          "Get driver login history failed",
          fallbackError,
        );
      }
    }

    return serverError(res, "Get driver login history failed", error);
  }
};

/* =========================================================
   DRIVER LOGIN
   Existing app body preserved:
   { schoolId, phone }
========================================================= */
exports.driverLogin = async (req, res) => {
  try {
    const schoolId =
      typeof req.body.schoolId === "string"
        ? req.body.schoolId.trim()
        : req.body.schoolId;

    const phone =
      typeof req.body.phone === "string"
        ? req.body.phone.trim()
        : req.body.phone;

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

    const driver = await Driver.findOne({
      schoolId,
      phone,
    })
      .select(
        "_id driverId schoolId name phone tokenVersion CurentJob loginHistory",
      )
      .lean();

    if (!driver) {
      return res.status(404).json({
        success: false,
        message: "Driver not found for this school",
      });
    }

    const now = new Date();

    const thirtyDaysAgo = new Date(
      now.getTime() - 30 * 24 * 60 * 60 * 1000,
    );

    const token = jwt.sign(
      {
        id: driver._id,
        driverId: driver.driverId,
        schoolId: driver.schoolId,
        tokenVersion: driver.tokenVersion || 0,
      },
      JWT_SECRET,
      {
        expiresIn: "30d",
      },
    );

    const forwardedIp = req.headers["x-forwarded-for"];

    const ipAddress =
      typeof forwardedIp === "string"
        ? forwardedIp.split(",")[0].trim()
        : req.socket?.remoteAddress || "";

    const deviceInfo = req.headers["user-agent"] || "";

    await Driver.updateOne(
      {
        _id: driver._id,
      },
      [
        {
          $set: {
            token,

            loginHistory: {
              $concatArrays: [
                {
                  $map: {
                    input: {
                      $filter: {
                        input: {
                          $ifNull: ["$loginHistory", []],
                        },
                        as: "history",
                        cond: {
                          $gte: [
                            "$$history.loginAt",
                            thirtyDaysAgo,
                          ],
                        },
                      },
                    },

                    as: "history",

                    in: {
                      $mergeObjects: [
                        "$$history",
                        {
                          logoutAt: {
                            $cond: [
                              {
                                $eq: [
                                  "$$history.logoutAt",
                                  null,
                                ],
                              },
                              now,
                              "$$history.logoutAt",
                            ],
                          },
                        },
                      ],
                    },
                  },
                },

                [
                  {
                    loginAt: now,
                    logoutAt: null,
                    ipAddress,
                    deviceInfo,
                  },
                ],
              ],
            },
          },
        },
      ],
      {
        updatePipeline: true,
      },
    );

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
    console.error("Driver login error:", error);

    return res.status(500).json({
      success: false,
      message: "Driver login failed",
      error: error.message,
    });
  }
};
/* =========================================================
   START DRIVER JOB
   Existing Flutter/admin body preserved:
   { schoolId, driverId, password, busNumber }

   Firebase transaction prevents two drivers from claiming
   the same bus at the same time.
========================================================= */
exports.startDriverJob = async (req, res) => {
  const tracker = createPerformanceTracker();

  const schoolId = normalize(req.body.schoolId);
  const driverId = normalize(req.body.driverId);
  const password = normalize(req.body.password);
  const busNumber = normalize(req.body.busNumber);

  if (!schoolId || !driverId || !password || !busNumber) {
    const timings = tracker.finish();

    return res.status(400).json({
      success: false,
      message: "schoolId, driverId, password and busNumber are required",
      performance: timings,
    });
  }

  try {
    /*
      Read driver and bus together.
    */
    const parallelReadStartedAt = performance.now();

    const [driver, bus] = await Promise.all([
      tracker.measure("mongoDriverRead", () =>
        Driver.findOne({
          schoolId,
          driverId,
          password,
        })
          .select("driverId schoolId name phone CurentJob")
          .lean(),
      ),

      tracker.measure("mongoBusRead", () =>
        Bus.findOne({
          schoolId,
          busNumber,
        })
          .select(
            "schoolId busNumber busAsignNumber driverlogin status",
          )
          .lean(),
      ),
    ]);

    tracker.mark("parallelMongoReadTotal", parallelReadStartedAt);

    if (!driver) {
      const timings = tracker.finish();

      return res.status(401).json({
        success: false,
        message: "Invalid credentials",
        performance: timings,
      });
    }

    if (!bus) {
      const timings = tracker.finish();

      return res.status(404).json({
        success: false,
        message: "Bus not found",
        performance: timings,
      });
    }

    /*
      If this driver already owns this bus, do not start it again.
    */
    if (bus.driverlogin?.driverId === driverId) {
      const timings = tracker.finish();

      return res.status(409).json({
        success: false,
        message:
          "This bus is already occupied by you. Please stop this bus first.",
        isOccupied: true,
        occupiedByMe: true,
        stopRequired: true,
        performance: timings,
      });
    }

    /*
      If another driver owns this bus, reject immediately.
    */
    if (
      bus.driverlogin?.driverId &&
      bus.driverlogin.driverId !== driverId
    ) {
      const timings = tracker.finish();

      return res.status(409).json({
        success: false,
        message: "Bus already occupied. Please select another bus.",
        isOccupied: true,
        occupiedByMe: false,
        stopRequired: false,
        occupied_by_driverId: bus.driverlogin.driverId,
        occupied_by_driverName:
          bus.driverlogin.driverName || null,
        performance: timings,
      });
    }

    const startedAt = new Date();
    const startedAtIso = startedAt.toISOString();

    /*
      MongoDB performs the atomic bus lock.

      Only one request can change a free bus to occupied.
    */
    const busClaimResult = await tracker.measure(
      "mongoAtomicBusClaim",
      () =>
        Bus.updateOne(
          {
            schoolId,
            busNumber,

            $or: [
              { "driverlogin.driverId": "" },
              { "driverlogin.driverId": null },
              {
                "driverlogin.driverId": {
                  $exists: false,
                },
              },
            ],
          },
          {
            $set: {
              "driverlogin.driverId": driver.driverId,
              "driverlogin.driverName": driver.name,
              "driverlogin.assignedAt": startedAt,

              "status.active": true,
              "status.tripStarted": true,
            },
          },
        ),
    );

    /*
      Another request claimed the bus after our first read.
    */
    if (busClaimResult.modifiedCount === 0) {
      const occupiedBus = await tracker.measure(
        "mongoOccupiedBusRead",
        () =>
          Bus.findOne({
            schoolId,
            busNumber,
          })
            .select("driverlogin")
            .lean(),
      );

      const occupiedDriverId =
        occupiedBus?.driverlogin?.driverId || null;

      const occupiedByMe =
        occupiedDriverId === driverId;

      const timings = tracker.finish();

      return res.status(409).json({
        success: false,
        message: occupiedByMe
          ? "This bus is already occupied by you. Please stop this bus first."
          : "Bus was occupied by another driver during this request.",
        isOccupied: true,
        occupiedByMe,
        stopRequired: occupiedByMe,
        occupied_by_driverId: occupiedDriverId,
        occupied_by_driverName:
          occupiedBus?.driverlogin?.driverName || null,
        performance: timings,
      });
    }

    const driverJobData = {
      busNumber: bus.busNumber,
      busAsignNumber: bus.busAsignNumber || "",
      startedAt,
    };

    /*
      One Firebase request updates both locations.

      Existing saving paths remain unchanged:
      busJobs/{schoolId}/{busNumber}
      driverJobs/{schoolId}/{driverId}
    */
    const firebaseUpdates = {
      [`busJobs/${schoolId}/${busNumber}/isOccupied`]: true,
      [`busJobs/${schoolId}/${busNumber}/schoolId`]: schoolId,
      [`busJobs/${schoolId}/${busNumber}/driverId`]:
        driver.driverId,
      [`busJobs/${schoolId}/${busNumber}/driverName`]:
        driver.name,
      [`busJobs/${schoolId}/${busNumber}/phone`]:
        driver.phone,
      [`busJobs/${schoolId}/${busNumber}/busNumber`]:
        bus.busNumber,
      [`busJobs/${schoolId}/${busNumber}/busAsignNumber`]:
        bus.busAsignNumber || "",
      [`busJobs/${schoolId}/${busNumber}/startedAt`]:
        startedAtIso,
      [`busJobs/${schoolId}/${busNumber}/endedAt`]: null,
      [`busJobs/${schoolId}/${busNumber}/updatedAt`]:
        startedAtIso,

      [`driverJobs/${schoolId}/${driverId}/isJobActive`]:
        true,
      [`driverJobs/${schoolId}/${driverId}/schoolId`]:
        schoolId,
      [`driverJobs/${schoolId}/${driverId}/driverId`]:
        driver.driverId,
      [`driverJobs/${schoolId}/${driverId}/driverName`]:
        driver.name,
      [`driverJobs/${schoolId}/${driverId}/phone`]:
        driver.phone,
      [`driverJobs/${schoolId}/${driverId}/currentBusNumber`]:
        bus.busNumber,
      [`driverJobs/${schoolId}/${driverId}/currentBusAsignNumber`]:
        bus.busAsignNumber || "",
      [`driverJobs/${schoolId}/${driverId}/startedAt`]:
        startedAtIso,
      [`driverJobs/${schoolId}/${driverId}/endedAt`]: null,
      [`driverJobs/${schoolId}/${driverId}/updatedAt`]:
        startedAtIso,
    };

    const parallelSaveStartedAt = performance.now();

    try {
      await Promise.all([
        tracker.measure("mongoDriverJobUpdate", () =>
          Driver.updateOne(
            {
              schoolId,
              driverId,
            },
            {
              $set: {
                CurentJob: driverJobData,
              },
            },
          ),
        ),

        tracker.measure("firebaseMultiLocationUpdate", () =>
          db.ref().update(firebaseUpdates),
        ),
      ]);

      tracker.mark(
        "parallelSaveTotal",
        parallelSaveStartedAt,
      );
    } catch (saveError) {
      /*
        Roll back the MongoDB bus lock if Firebase or driver update fails.
      */
      await Promise.allSettled([
        tracker.measure("mongoBusRollback", () =>
          Bus.updateOne(
            {
              schoolId,
              busNumber,
              "driverlogin.driverId": driverId,
            },
            {
              $set: {
                "driverlogin.driverId": "",
                "driverlogin.driverName": "",
                "driverlogin.assignedAt": null,
                "status.tripStarted": false,
              },
            },
          ),
        ),

        tracker.measure("mongoDriverRollback", () =>
          Driver.updateOne(
            {
              schoolId,
              driverId,
              "CurentJob.busNumber": busNumber,
            },
            {
              $set: {
                "CurentJob.busNumber": "",
                "CurentJob.busAsignNumber": "",
                "CurentJob.startedAt": null,
              },
            },
          ),
        ),
      ]);

      throw saveError;
    }

    const timings = tracker.finish();

    res.setHeader(
      "X-Controller-Time",
      `${timings.controllerTotal}ms`,
    );

    console.log("Start driver job performance:", {
      schoolId,
      driverId,
      busNumber,
      result: "success",
      timings,
    });

    return res.status(200).json({
      success: true,
      message: "Bus started successfully",
      data: {
        isJobActive: true,
        busNumber: bus.busNumber,
        busAsignNumber: bus.busAsignNumber || "",
        driverId: driver.driverId,
        driverName: driver.name,
        startedAt,
      },
      performance: timings,
    });
  } catch (error) {
    const timings = tracker.finish();

    console.error("Start driver job error:", {
      schoolId,
      driverId,
      busNumber,
      error: error.message,
      timings,
    });

    return res.status(500).json({
      success: false,
      message: "Start driver job failed",
      error: error.message,
      performance: timings,
    });
  }
};

/* =========================================================
   END DRIVER JOB
   Existing body preserved:
   { schoolId, driverId, password, busNumber }
========================================================= */
exports.endDriverJob = async (req, res) => {
  const tracker = createPerformanceTracker();

  const schoolId = normalize(req.body.schoolId);
  const driverId = normalize(req.body.driverId);
  const password = normalize(req.body.password);
  const busNumber = normalize(req.body.busNumber);

  if (!schoolId || !driverId || !password || !busNumber) {
    const timings = tracker.finish();

    return res.status(400).json({
      success: false,
      message: "schoolId, driverId, password and busNumber are required",
      performance: timings,
    });
  }

  try {
    /*
      MongoDB is now the ownership source.
      Driver and bus are loaded together.
    */
    const parallelReadStartedAt = performance.now();

    const [driver, bus] = await Promise.all([
      tracker.measure("mongoDriverRead", () =>
        Driver.findOne({
          schoolId,
          driverId,
          password,
        })
          .select("driverId CurentJob")
          .lean(),
      ),

      tracker.measure("mongoBusRead", () =>
        Bus.findOne({
          schoolId,
          busNumber,
        })
          .select("busNumber busAsignNumber driverlogin status")
          .lean(),
      ),
    ]);

    tracker.mark(
      "parallelMongoReadTotal",
      parallelReadStartedAt,
    );

    if (!driver) {
      const timings = tracker.finish();

      return res.status(401).json({
        success: false,
        message: "Invalid credentials",
        performance: timings,
      });
    }

    if (!bus) {
      const timings = tracker.finish();

      return res.status(404).json({
        success: false,
        message: "Bus not found",
        performance: timings,
      });
    }

    if (!bus.driverlogin?.driverId) {
      const timings = tracker.finish();

      return res.status(400).json({
        success: false,
        message: "This bus is not active",
        performance: timings,
      });
    }

    if (bus.driverlogin.driverId !== driverId) {
      const timings = tracker.finish();

      return res.status(403).json({
        success: false,
        message:
          `This bus is occupied by another driver ` +
          `${bus.driverlogin.driverId}-${bus.driverlogin.driverName}. ` +
          `You cannot stop this bus.`,
        occupied_by_driverId:
          bus.driverlogin.driverId,
        occupied_by_driverName:
          bus.driverlogin.driverName || null,
        performance: timings,
      });
    }

    const endedAt = new Date();
    const endedAtIso = endedAt.toISOString();

    /*
      Atomic release: only the current driver can release this bus.
    */
    const busRelease = await tracker.measure(
      "mongoAtomicBusRelease",
      () =>
        Bus.updateOne(
          {
            schoolId,
            busNumber,
            "driverlogin.driverId": driverId,
          },
          {
            $set: {
              "driverlogin.driverId": "",
              "driverlogin.driverName": "",
              "driverlogin.assignedAt": null,
              "status.tripStarted": false,
            },
          },
        ),
    );

    if (busRelease.modifiedCount === 0) {
      const timings = tracker.finish();

      return res.status(409).json({
        success: false,
        message:
          "Bus ownership changed during this request. Please refresh the status.",
        performance: timings,
      });
    }

    const firebaseUpdates = {
      [`busJobs/${schoolId}/${busNumber}/isOccupied`]: false,
      [`busJobs/${schoolId}/${busNumber}/endedAt`]:
        endedAtIso,
      [`busJobs/${schoolId}/${busNumber}/updatedAt`]:
        endedAtIso,

      [`driverJobs/${schoolId}/${driverId}/isJobActive`]:
        false,
      [`driverJobs/${schoolId}/${driverId}/currentBusNumber`]:
        null,
      [`driverJobs/${schoolId}/${driverId}/currentBusAsignNumber`]:
        null,
      [`driverJobs/${schoolId}/${driverId}/endedAt`]:
        endedAtIso,
      [`driverJobs/${schoolId}/${driverId}/updatedAt`]:
        endedAtIso,
    };

    const parallelSaveStartedAt = performance.now();

    try {
      await Promise.all([
        tracker.measure("mongoDriverJobClear", () =>
          Driver.updateOne(
            {
              schoolId,
              driverId,
              "CurentJob.busNumber": busNumber,
            },
            {
              $set: {
                "CurentJob.busNumber": "",
                "CurentJob.busAsignNumber": "",
                "CurentJob.startedAt": null,
              },
            },
          ),
        ),

        tracker.measure("firebaseMultiLocationUpdate", () =>
          db.ref().update(firebaseUpdates),
        ),
      ]);

      tracker.mark(
        "parallelSaveTotal",
        parallelSaveStartedAt,
      );
    } catch (saveError) {
      /*
        Restore MongoDB bus ownership when final syncing fails.
      */
      await tracker.measure("mongoBusReleaseRollback", () =>
        Bus.updateOne(
          {
            schoolId,
            busNumber,
            $or: [
              { "driverlogin.driverId": "" },
              { "driverlogin.driverId": null },
            ],
          },
          {
            $set: {
              "driverlogin.driverId": driverId,
              "driverlogin.driverName":
                bus.driverlogin.driverName || "",
              "driverlogin.assignedAt":
                bus.driverlogin.assignedAt || null,
              "status.active": true,
              "status.tripStarted": true,
            },
          },
        ),
      );

      throw saveError;
    }

    const timings = tracker.finish();

    res.setHeader(
      "X-Controller-Time",
      `${timings.controllerTotal}ms`,
    );

    console.log("End driver job performance:", {
      schoolId,
      driverId,
      busNumber,
      result: "success",
      timings,
    });

    return res.status(200).json({
      success: true,
      message: "Selected bus stopped successfully",
      data: {
        busNumber,
        stoppedBy: driverId,
        endedAt,
      },
      performance: timings,
    });
  } catch (error) {
    const timings = tracker.finish();

    console.error("End driver job error:", {
      schoolId,
      driverId,
      busNumber,
      error: error.message,
      timings,
    });

    return res.status(500).json({
      success: false,
      message: "Stop driver job failed",
      error: error.message,
      performance: timings,
    });
  }
};

/* =========================================================
   GET SELECTED BUS STATUS
   params: /:schoolId/:driverId/:busNumber
========================================================= */
exports.getDriverBusJobStatus = async (req, res) => {
  const startedAt = performance.now();

  try {
    const schoolId = normalize(req.params.schoolId);
    const driverId = normalize(req.params.driverId);
    const busNumber = normalize(req.params.busNumber);

    if (!schoolId || !driverId || !busNumber) {
      return res.status(400).json({
        success: false,
        message: "schoolId, driverId and busNumber are required",
      });
    }

    const mongoStartedAt = performance.now();

    const bus = await Bus.findOne({
      schoolId,
      busNumber,
    })
      .select(
        "busNumber busAsignNumber driverlogin status",
      )
      .lean();

    const mongoBusRead = Number(
      (performance.now() - mongoStartedAt).toFixed(2),
    );

    if (!bus) {
      const controllerTotal = Number(
        (performance.now() - startedAt).toFixed(2),
      );

      res.setHeader(
        "X-Database-Time",
        `${mongoBusRead} ms`,
      );

      res.setHeader(
        "X-API-Time",
        `${controllerTotal} ms`,
      );

      return res.status(404).json({
        success: false,
        message: "Bus not found",
        performance: {
          mongoBusRead,
          controllerTotal,
        },
      });
    }

    const occupiedDriverId =
      bus.driverlogin?.driverId || null;

    const occupiedDriverName =
      bus.driverlogin?.driverName || null;

    const isOccupied =
      Boolean(occupiedDriverId) &&
      bus.status?.tripStarted === true;

    const occupiedByMe =
      isOccupied &&
      occupiedDriverId === driverId;

    const controllerTotal = Number(
      (performance.now() - startedAt).toFixed(2),
    );

    res.setHeader(
      "X-Database-Time",
      `${mongoBusRead} ms`,
    );

    res.setHeader(
      "X-API-Time",
      `${controllerTotal} ms`,
    );

    return res.status(200).json({
      success: true,
      isOccupied,
      occupiedByMe,
      stopRequired:
        isOccupied && occupiedByMe,

      message: !isOccupied
        ? "Bus is free"
        : occupiedByMe
          ? "Bus is occupied by you. You can stop this bus."
          : "Bus is occupied by another driver.",

      data: {
        busNumber: bus.busNumber,
        busAsignNumber:
          bus.busAsignNumber || "",

        occupiedDriverId,
        occupiedDriverName,

        mongo: {
          driverlogin:
            bus.driverlogin || {},
          status:
            bus.status || {},
        },
      },

      performance: {
        mongoBusRead,
        controllerTotal,
      },
    });
  } catch (error) {
    const controllerTotal = Number(
      (performance.now() - startedAt).toFixed(2),
    );

    return res.status(500).json({
      success: false,
      message: "Bus status fetch failed",
      error: error.message,
      performance: {
        controllerTotal,
      },
    });
  }
};
/* =========================================================
   GET DEFAULT ASSIGNED BUS
   Existing body preserved:
   { schoolId, driverId }

   Important fix:
   old code searched Bus.findOne({ schoolId }) and could return
   the wrong first bus. This filters by defaultAsignBusNumber.
========================================================= */
exports.getDefaultAssignedBus = async (req, res) => {
  try {
    const schoolId = normalize(req.body.schoolId);
    const driverId = normalize(req.body.driverId);

    if (!schoolId || !driverId) {
      return res.status(400).json({
        success: false,
        message: "schoolId and driverId are required",
      });
    }

    const driver = await Driver.findOne({ schoolId, driverId })
      .select("driverId name phone defaultAsignBusNumber")
      .lean();

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

    const bus = await Bus.findOne({
      schoolId,
      busNumber: driver.defaultAsignBusNumber,
    })
      .select(
        "busNumber busAsignNumber defaultAsignDriver driverlogin status",
      )
      .lean();

    if (!bus) {
      return res.status(404).json({
        success: false,
        message: "Assigned bus not found",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Default assigned bus fetched successfully",
      data: {
        driver,
        // Keep old key "buses" so existing Flutter code does not break.
        buses: bus,
      },
    });
  } catch (error) {
    return serverError(res, "Get default assigned bus failed", error);
  }
};