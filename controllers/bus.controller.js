const Bus = require("../models/Bus");
const School = require("../models/School");
const Driver = require("../models/Driver");
const User = require("../models/students");

/*
============================================================
HELPERS
============================================================
*/

const cleanString = (value) =>
  typeof value === "string" ? value.trim() : value;

const serverError = (res, error, operation) => {
  console.error(`${operation}:`, error);

  if (error?.code === 11000) {
    const duplicateField = Object.keys(error.keyPattern || {})[0];

    return res.status(409).json({
      success: false,
      message: duplicateField
        ? `${duplicateField} already exists`
        : "Duplicate bus data",
    });
  }

  return res.status(500).json({
    success: false,
    message: "Server error",
  });
};

/*
============================================================
1. REGISTER BUS
============================================================

POST /api/v1/bus/register

BODY:
{
  "busNumber": "UP15AB1234",
  "busAsignNumber": "BUS-101"
}

MongoDB automatically creates _id.
Frontend does not send _id.
*/

exports.registerBus = async (req, res) => {
  try {
    const schoolId = cleanString(req.user?.schoolId);
    const busNumber = cleanString(req.body?.busNumber);
    const busAsignNumber = cleanString(req.body?.busAsignNumber);

    if (!schoolId || !busNumber || !busAsignNumber) {
      return res.status(400).json({
        success: false,
        message: "busNumber and busAsignNumber are required",
      });
    }

    const [existingBus, schoolExists] = await Promise.all([
      Bus.exists({
        $or: [
          { busNumber },
          {
            schoolId,
            busAsignNumber,
          },
        ],
      }),

      School.exists({
        schoolId,
      }),
    ]);

    if (existingBus) {
      return res.status(409).json({
        success: false,
        message: "Bus number or bus assign number already exists",
      });
    }

    if (!schoolExists) {
      return res.status(404).json({
        success: false,
        message: "School not found",
      });
    }

    const newBus = await Bus.create({
      schoolId,
      busNumber,
      busAsignNumber,
    });

    await School.updateOne(
      {
        schoolId,
      },
      {
        $push: {
          buses: {
            busNumber,
          },
        },
        $inc: {
          "stats.totalBuses": 1,
        },
      },
    );

    return res.status(201).json({
      success: true,
      message: "Bus registered successfully",
      data: {
        _id: newBus._id,
        schoolId: newBus.schoolId,
        busNumber: newBus.busNumber,
        busAsignNumber: newBus.busAsignNumber,
        status: newBus.status,
        createdAt: newBus.createdAt,
      },
    });
  } catch (error) {
    return serverError(res, error, "Register bus error");
  }
};

/*
============================================================
2. ASSIGN DEFAULT DRIVER
============================================================

POST /api/v1/bus/assign-default-driver

BODY:
{
  "busNumber": "UP15AB1234",
  "driverId": "DRV-12345"
}
*/

exports.assignDefaultDriverToBus = async (req, res) => {
  try {
    const schoolId = cleanString(req.user?.schoolId);
    const busNumber = cleanString(req.body?.busNumber);
    const driverId = cleanString(req.body?.driverId);

    if (!schoolId || !busNumber || !driverId) {
      return res.status(400).json({
        success: false,
        message: "busNumber and driverId are required",
      });
    }

    const [driver, bus] = await Promise.all([
      Driver.findOne(
        {
          schoolId,
          driverId,
        },
        {
          _id: 0,
          driverId: 1,
          name: 1,
          phone: 1,
        },
      ).lean(),

      Bus.findOne(
        {
          schoolId,
          busNumber,
        },
        {
          _id: 0,
          busNumber: 1,
        },
      ).lean(),
    ]);

    if (!driver) {
      return res.status(404).json({
        success: false,
        message: "Driver not found",
      });
    }

    if (!bus) {
      return res.status(404).json({
        success: false,
        message: "Bus not found",
      });
    }

    const defaultDriver = {
      DriverId: driver.driverId,
      DriverName: driver.name,
      phone: driver.phone,
    };

    const [busUpdate, driverUpdate] = await Promise.all([
      Bus.updateOne(
        {
          schoolId,
          busNumber,
        },
        {
          $set: {
            defaultAsignDriver: defaultDriver,
          },
        },
      ),

      Driver.updateOne(
        {
          schoolId,
          driverId,
        },
        {
          $set: {
            defaultAsignBusNumber: busNumber,
          },
        },
      ),
    ]);

    if (!busUpdate.matchedCount || !driverUpdate.matchedCount) {
      return res.status(409).json({
        success: false,
        message: "Driver assignment could not be completed",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Default driver assigned successfully",
      data: {
        busNumber,
        defaultAsignDriver: defaultDriver,
      },
    });
  } catch (error) {
    return serverError(
      res,
      error,
      "Assign default driver error",
    );
  }
};

/*
============================================================
3. GET ALL BUSES
============================================================

GET /api/v1/bus/all

No body required.
*/

exports.getAllBuses = async (req, res) => {
  try {
    const schoolId = cleanString(req.user?.schoolId);

    if (!schoolId) {
      return res.status(401).json({
        success: false,
        message: "Invalid authentication token",
      });
    }

    const buses = await Bus.find(
      {
        schoolId,
      },
      {
        busNumber: 1,
        busAsignNumber: 1,
        schoolId: 1,
        defaultAsignDriver: 1,
        driverlogin: 1,
        status: 1,
        createdAt: 1,
        updatedAt: 1,
      },
    )
      .sort({
        createdAt: -1,
      })
      .lean();

    return res.status(200).json({
      success: true,
      count: buses.length,
      data: buses,
    });
  } catch (error) {
    return serverError(res, error, "Get all buses error");
  }
};

/*
============================================================
4. EDIT BUS
============================================================

PUT /api/v1/bus/editBus

BODY:
{
  "currentBusNumber": "UP15AB1234",
  "newBusNumber": "UP15AB9999",
  "busAsignNumber": "BUS-202"
}

newBusNumber and busAsignNumber are optional,
but at least one is required.
*/

exports.editBus = async (req, res) => {
  try {
    const schoolId = cleanString(req.user?.schoolId);
    const currentBusNumber = cleanString(
      req.body?.currentBusNumber,
    );
    const newBusNumber = cleanString(req.body?.newBusNumber);
    const busAsignNumber = cleanString(
      req.body?.busAsignNumber,
    );

    if (!schoolId || !currentBusNumber) {
      return res.status(400).json({
        success: false,
        message: "currentBusNumber is required",
      });
    }

    if (!newBusNumber && !busAsignNumber) {
      return res.status(400).json({
        success: false,
        message: "newBusNumber or busAsignNumber is required",
      });
    }

    const existingBus = await Bus.findOne(
      {
        schoolId,
        busNumber: currentBusNumber,
      },
      {
        _id: 0,
        busNumber: 1,
        busAsignNumber: 1,
      },
    ).lean();

    if (!existingBus) {
      return res.status(404).json({
        success: false,
        message: "Bus not found",
      });
    }

    const duplicateConditions = [];

    if (
      newBusNumber &&
      newBusNumber !== currentBusNumber
    ) {
      duplicateConditions.push({
        busNumber: newBusNumber,
      });
    }

    if (
      busAsignNumber &&
      busAsignNumber !== existingBus.busAsignNumber
    ) {
      duplicateConditions.push({
        schoolId,
        busAsignNumber,
      });
    }

    if (duplicateConditions.length) {
      const duplicateBus = await Bus.exists({
        $or: duplicateConditions,
      });

      if (duplicateBus) {
        return res.status(409).json({
          success: false,
          message: "Bus number or bus assign number already exists",
        });
      }
    }

    const updateData = {};

    if (newBusNumber) {
      updateData.busNumber = newBusNumber;
    }

    if (busAsignNumber) {
      updateData.busAsignNumber = busAsignNumber;
    }

    const updatedBus = await Bus.findOneAndUpdate(
      {
        schoolId,
        busNumber: currentBusNumber,
      },
      {
        $set: updateData,
      },
      {
        new: true,
        runValidators: true,
        projection: {
          busNumber: 1,
          busAsignNumber: 1,
          schoolId: 1,
          defaultAsignDriver: 1,
          driverlogin: 1,
          status: 1,
          createdAt: 1,
          updatedAt: 1,
        },
      },
    ).lean();

    const busNumberChanged =
      newBusNumber &&
      newBusNumber !== currentBusNumber;

    if (busNumberChanged) {
      await Promise.all([
        School.updateOne(
          {
            schoolId,
            "buses.busNumber": currentBusNumber,
          },
          {
            $set: {
              "buses.$.busNumber": newBusNumber,
            },
          },
        ),

        User.updateMany(
          {
            schoolId,
            "children.busNumber": currentBusNumber,
          },
          {
            $set: {
              "children.$[child].busNumber": newBusNumber,
            },
          },
          {
            arrayFilters: [
              {
                "child.busNumber": currentBusNumber,
              },
            ],
          },
        ),

        Driver.updateMany(
          {
            schoolId,
            defaultAsignBusNumber: currentBusNumber,
          },
          {
            $set: {
              defaultAsignBusNumber: newBusNumber,
            },
          },
        ),
      ]);
    }

    return res.status(200).json({
      success: true,
      message: "Bus updated successfully",
      data: updatedBus,
    });
  } catch (error) {
    return serverError(res, error, "Edit bus error");
  }
};

/*
============================================================
5. REMOVE BUS
============================================================

DELETE /api/v1/bus/removeBus

BODY:
{
  "busNumber": "UP15AB1234"
}

No Mongo Object ID is required.
*/

exports.removeBus = async (req, res) => {
  try {
    const schoolId = cleanString(req.user?.schoolId);
    const busNumber = cleanString(req.body?.busNumber);

    if (!schoolId || !busNumber) {
      return res.status(400).json({
        success: false,
        message: "busNumber is required",
      });
    }

    const [bus, assignedStudentExists] = await Promise.all([
      Bus.findOne(
        {
          schoolId,
          busNumber,
        },
        {
          _id: 0,
          busNumber: 1,
        },
      ).lean(),

      User.exists({
        schoolId,
        "children.busNumber": busNumber,
      }),
    ]);

    if (!bus) {
      return res.status(404).json({
        success: false,
        message: "Bus not found",
      });
    }

    if (assignedStudentExists) {
      return res.status(400).json({
        success: false,
        message:
          "Bus is assigned to students. Remove student assignments first.",
      });
    }

    const [schoolUpdate, busDelete] = await Promise.all([
      School.updateOne(
        {
          schoolId,
        },
        {
          $pull: {
            buses: {
              busNumber,
            },
          },
          $inc: {
            "stats.totalBuses": -1,
          },
        },
      ),

      Bus.deleteOne({
        schoolId,
        busNumber,
      }),
    ]);

    if (!busDelete.deletedCount) {
      return res.status(404).json({
        success: false,
        message: "Bus was already removed",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Bus removed successfully",
      data: {
        busNumber,
        schoolUpdated: schoolUpdate.modifiedCount > 0,
      },
    });
  } catch (error) {
    return serverError(res, error, "Remove bus error");
  }
};