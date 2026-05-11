const generateId = require("../utils/generateId");

const Bus = require("../models/Bus");
const School = require("../models/School");

/*
  ============================================================
  API: Register Bus
  METHOD: POST

  Sample Request Body:
  {
    "schoolId": "SCH001",
    "busNumber": "UP15AB1234",
    "busAsignNumber": "BUS-101"
  }
  ============================================================
*/

exports.registerBus = async (req, res) => {
  try {
    const {
      schoolId,
      busNumber,
      busAsignNumber,
    } = req.body;

    /*
      Validate required fields
    */

    if (
      !busNumber ||
      !busAsignNumber ||
      !schoolId
    ) {
      return res.status(400).json({
        success: false,

        message:
          "busNumber, schoolId and busAsignNumber are required",
      });
    }

    /*
      Prevent duplicate bus
    */

    const existingBus =
      await Bus.findOne({
        $or: [
          { busNumber },
          { busAsignNumber },
        ],
      });

    if (existingBus) {

      return res.status(409).json({
        success: false,
        message:
          "Bus already registered",
      });
    }

    /*
      Validate school
    */

    const existingSchool =
      await School.findOne({
        schoolId,
      });

    if (!existingSchool) {

      return res.status(404).json({
        success: false,
        message:
          "schoolId not found",
      });
    }

    /*
      Create bus
    */

    const bus =
      await Bus.create({

        busNumber,

        busAsignNumber,

        schoolId,

        driverlogin: {},
      });

    /*
      Add bus reference
      inside school dashboard
    */

    await School.updateOne(
      { schoolId },

      {
        $push: {
          buses: {
            busNumber:
              bus.busNumber,
          },
        },

        $inc: {
          "stats.totalBuses": 1,
        },
      },
    );

    /*
      TODO:
      Publish Kafka event

      bus-created
    */

    /*
      TODO:
      Sync Redis cache

      school_buses:SCH001
    */

    return res.status(201).json({
      success: true,

      message:
        "Bus registered successfully",

      data: bus,
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
=====================================
2. EDIT BUS
=====================================

Updates:
- busNumber
- busAsignNumber

Used by:
- school dashboard
- admin panel
*/

exports.editBus = async (req, res) => {

  try {

    const { busId } = req.query;

    const {
      busNumber,
      busAsignNumber,
    } = req.body;

    /*
      Validate fields
    */

    if (
      !busNumber &&
      !busAsignNumber
    ) {
      return res.status(400).json({
        success: false,

        message:
          "busNumber or busAsignNumber is required",
      });
    }

    /*
      Find bus
    */

    const existingBus =
      await Bus.findById(busId);

    if (!existingBus) {

      return res.status(404).json({
        success: false,
        message: "Bus not found",
      });
    }

    /*
      Prevent duplicate
      bus number or assign number
    */

    const duplicateBus =
      await Bus.findOne({

        _id: { $ne: busId },

        $or: [
          busNumber
            ? { busNumber }
            : null,

          busAsignNumber
            ? { busAsignNumber }
            : null,
        ].filter(Boolean),
      });

    if (duplicateBus) {

      return res.status(409).json({
        success: false,

        message:
          "Bus number or assign number already exists",
      });
    }

    /*
      Update fields
    */

    if (busNumber) {
      existingBus.busNumber =
        busNumber;
    }

    if (busAsignNumber) {
      existingBus.busAsignNumber =
        busAsignNumber;
    }

    await existingBus.save();

    /*
      TODO:
      Publish Kafka event

      bus-updated
    */

    /*
      TODO:
      Sync Redis cache
    */

    return res.status(200).json({
      success: true,

      message:
        "Bus updated successfully",

      data: existingBus,
    });

  } catch (error) {

    console.log(error);

    return res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};


/*
=====================================
3. REMOVE BUS
=====================================

Removes:
- bus
- school bus reference

Used by:
- school dashboard
- admin panel
*/

exports.removeBus = async (req, res) => {

  try {

    const { busId } = req.query;

    /*
      Find bus
    */

    const bus =
      await Bus.findById(busId);

    if (!bus) {

      return res.status(404).json({
        success: false,
        message: "Bus not found",
      });
    }

    /*
      Remove bus
      from school dashboard
    */

    await School.updateOne(

      {
        schoolId: bus.schoolId,
      },

      {
        $pull: {
          buses: {
            busNumber:
              bus.busNumber,
          },
        },

        $inc: {
          "stats.totalBuses": -1,
        },
      },
    );

    /*
      Delete bus
    */

    await Bus.findByIdAndDelete(
      busId
    );

    /*
      TODO:
      Delete related
      pickup points

      TODO:
      Publish Kafka event

      bus-removed
    */

    /*
      TODO:
      Clear Redis cache
    */

    return res.status(200).json({
      success: true,

      message:
        "Bus removed successfully",
    });

  } catch (error) {

    console.log(error);

    return res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};