const generateId = require("../utils/generateId");

const Bus = require("../models/Bus");
const School = require("../models/School");
const User = require("../models/students");

/*
============================================================
1. REGISTER BUS
============================================================

API:
POST /api/v1/bus/register

DATA TO PASS:
{
  "schoolId": "SCH001",
  "busNumber": "UP15AB1234",
  "busAsignNumber": "BUS-101"
}
*/

exports.registerBus = async (req, res) => {
  try {
    const { busNumber, busAsignNumber } = req.body;
    const { schoolId } = req.user;
    console.log("SCHOOL ID FROM TOKEN:", schoolId, busNumber, busAsignNumber);

    /*
    =====================================
    VALIDATION
    =====================================
    */

    if (!schoolId || !busNumber || !busAsignNumber) {
      return res.status(400).json({
        success: false,

        message: "schoolId, busNumber and busAsignNumber are required",
      });
    }

    /*
    =====================================
    CHECK DUPLICATE BUS
    =====================================
    */

    const existingBus = await Bus.findOne({
      $or: [{ busNumber }, { busAsignNumber }],
    });

    if (existingBus) {
      return res.status(409).json({
        success: false,

        message: "Bus already registered",
      });
    }

    /*
    =====================================
    CHECK SCHOOL
    =====================================
    */

    const school = await School.findOne({
      schoolId,
    });

    if (!school) {
      return res.status(404).json({
        success: false,

        message: "School not found",
      });
    }

    /*
    =====================================
    CREATE BUS
    =====================================
    */

    const newBus = await Bus.create({
      busNumber,

      busAsignNumber,

      schoolId,

      driverlogin: {},
    });

    /*
    =====================================
    UPDATE SCHOOL DASHBOARD
    =====================================
    */

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

      data: newBus,
    });
  } catch (err) {
    console.log(err);

    return res.status(500).json({
      success: false,

      message: "Server error",
    });
  }
};
/*
============================================================
GET ALL BUSES
============================================================
*/

exports.getAllBuses = async (req, res) => {
  try {
    /*
      ============================================
      SCHOOL FROM TOKEN
      ============================================
      */

    const schoolId = req.user.schoolId;

    /*
      ============================================
      GET SCHOOL BUSES
      ============================================
      */

    const buses = await Bus.find({
      schoolId,
    })

      .sort({
        createdAt: -1,
      });

    return res.status(200).json({
      success: true,

      count: buses.length,

      data: buses,
    });
  } catch (err) {
    return res.status(500).json({
      success: false,

      message: "Server error",
    });
  }
};

/*
============================================================
2. EDIT BUS
============================================================

API:
PUT /api/v1/bus/edit?busId=BUS_OBJECT_ID

DATA TO PASS:
{
  "busNumber": "UP15AB9999",
  "busAsignNumber": "BUS-202"
}
*/

exports.editBus = async (req, res) => {
  try {
    const { busId } = req.query;

    const { busNumber, busAsignNumber } = req.body;

    /*
    =====================================
    VALIDATION
    =====================================
    */

    if (!busNumber && !busAsignNumber) {
      return res.status(400).json({
        success: false,

        message: "busNumber or busAsignNumber required",
      });
    }

    /*
    =====================================
    FIND BUS
    =====================================
    */

    const existingBus = await Bus.findById(busId);

    if (!existingBus) {
      return res.status(404).json({
        success: false,

        message: "Bus not found",
      });
    }

    /*
    =====================================
    PREVENT DUPLICATES
    =====================================
    */

    const duplicateBus = await Bus.findOne({
      _id: {
        $ne: busId,
      },

      $or: [
        busNumber ? { busNumber } : null,

        busAsignNumber ? { busAsignNumber } : null,
      ].filter(Boolean),
    });

    if (duplicateBus) {
      return res.status(409).json({
        success: false,

        message: "Bus number already exists",
      });
    }

    /*
    =====================================
    STORE OLD BUS NUMBER
    =====================================
    */

    const oldBusNumber = existingBus.busNumber;

    /*
    =====================================
    UPDATE BUS
    =====================================
    */

    if (busNumber) {
      existingBus.busNumber = busNumber;
    }

    if (busAsignNumber) {
      existingBus.busAsignNumber = busAsignNumber;
    }

    await existingBus.save();

    /*
    =====================================
    UPDATE SCHOOL BUS REFERENCE
    =====================================
    */

    if (busNumber && oldBusNumber !== busNumber) {
      await School.updateOne(
        {
          schoolId: existingBus.schoolId,

          "buses.busNumber": oldBusNumber,
        },

        {
          $set: {
            "buses.$.busNumber": busNumber,
          },
        },
      );

      /*
      =====================================
      UPDATE CHILDREN BUS MAPPING
      =====================================
      */

      await User.updateMany(
        {
          "children.busNumber": oldBusNumber,
        },

        {
          $set: {
            "children.$[elem].busNumber": busNumber,
          },
        },

        {
          arrayFilters: [
            {
              "elem.busNumber": oldBusNumber,
            },
          ],
        },
      );
    }

    return res.status(200).json({
      success: true,

      message: "Bus updated successfully",

      data: existingBus,
    });
  } catch (err) {
    console.log(err);

    return res.status(500).json({
      success: false,

      message: "Server error",
    });
  }
};

/*
============================================================
3. REMOVE BUS
============================================================

API:
DELETE /api/v1/bus/remove?busId=BUS_OBJECT_ID
*/

exports.removeBus = async (req, res) => {
  try {
    const { busId } = req.query;

    /*
    =====================================
    FIND BUS
    =====================================
    */

    const bus = await Bus.findById(busId);

    if (!bus) {
      return res.status(404).json({
        success: false,

        message: "Bus not found",
      });
    }

    /*
    =====================================
    CHECK STUDENT ASSIGNMENT
    =====================================
    */

    const assignedStudents = await User.findOne({
      "children.busNumber": bus.busNumber,
    });

    if (assignedStudents) {
      return res.status(400).json({
        success: false,

        message: "Bus assigned to students",
      });
    }

    /*
    =====================================
    REMOVE FROM SCHOOL
    =====================================
    */

    await School.updateOne(
      {
        schoolId: bus.schoolId,
      },

      {
        $pull: {
          buses: {
            busNumber: bus.busNumber,
          },
        },

        $inc: {
          "stats.totalBuses": -1,
        },
      },
    );

    /*
    =====================================
    DELETE BUS
    =====================================
    */

    await Bus.findByIdAndDelete(busId);

    return res.status(200).json({
      success: true,

      message: "Bus removed successfully",
    });
  } catch (err) {
    console.log(err);

    return res.status(500).json({
      success: false,

      message: "Server error",
    });
  }
};
