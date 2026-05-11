const PickupPoint = require("../models/PickupPoint");
const generateId = require("../utils/generateId");
const redisClient = require("../config/redis");
/*
=====================================
1. CREATE PICKUP POINT
=====================================

Creates:
- new pickup document
OR
- adds pickup point
inside existing bus

Optimized for:
- school dashboard
- Redis sync
- Kafka consumers
- realtime geofence engine
*/
/*{
  "schoolId": "SCH-12345678",

  "busNumber": "UP15AB1234",

  "pickupPoints": [
    {
      "name": "Near Temple",

      "location": {
        

        "coordinates": [
          77.2090,
          28.6139
        ]
      }
    },{
      "name": "Near Temple",

      "location": {
       

        "coordinates": [
          77.2090,
          28.6139
        ]
      }
    }
  ]
}*/

exports.createPickupPoint = async (req, res) => {
  try {
    const { schoolId, busNumber, pickupPoints } = req.body;

    /*
      =====================================
      VALIDATE ARRAY
      =====================================
      */

    if (
      !pickupPoints ||
      !Array.isArray(pickupPoints) ||
      pickupPoints.length === 0
    ) {
      return res.status(400).json({
        success: false,

        message: "pickupPoints array is required",
      });
    }

    /*
      =====================================
      VALIDATE & PREPARE PICKUP POINTS
      =====================================
      */

    const preparedPickupPoints = pickupPoints.map((point) => {
      /*
          Validate coordinates
          */

      if (
        !point.location ||
        
        !Array.isArray(point.location.coordinates) ||
        point.location.coordinates.length !== 2
      ) {
        throw new Error("Invalid location coordinates");
      }

      const lng = point.location.coordinates[0];

      const lat = point.location.coordinates[1];

      /*
          Validate numbers
          */

      if (typeof lng !== "number" || typeof lat !== "number") {
        throw new Error("Longitude and latitude must be numbers");
      }

      /*
          Auto generate ID
          */

      return {
        pickupPointId: `PP-${generateId()}`,

        name: point.name,

        location: point.location,

        assignedStudents: point.assignedStudents || [],
      };
    });

    /*
      =====================================
      FIND EXISTING DOCUMENT
      =====================================
      */

    const existing = await PickupPoint.findOne({
      schoolId,
      busNumber,
    });

    /*
      =====================================
      ADD TO EXISTING DOCUMENT
      =====================================
      */

    if (existing) {
      existing.pickupPoints.push(...preparedPickupPoints);

      await existing.save();

      /*
          TODO:
          Publish Kafka event
        */

      return res.status(200).json({
        success: true,

        message: "Pickup points added successfully",

        data: existing,
      });
    }

    /*
      =====================================
      CREATE NEW DOCUMENT
      =====================================
      */

    const newPickupPoint = await PickupPoint.create({
      schoolId,

      busNumber,

      pickupPoints: preparedPickupPoints,
    });

    /*
        TODO:
        Sync Redis cache
      */

    return res.status(201).json({
      success: true,

      message: "Pickup document created successfully",

      data: newPickupPoint,
    });
  } catch (error) {
    console.log(error);

    return res.status(500).json({
      success: false,

      message: error.message || "Server error",
    });
  }
};

/*
=====================================
2. ADD STUDENT
=====================================

Adds student to:
specific pickup point

Used by:
- school dashboard
- admin panel
*/

exports.addStudent = async (req, res) => {
  try {
    const { schoolId, pickupPointId, student } = req.body;

    /*
        Find pickup document
      */

    const pickupDoc = await PickupPoint.findOne({
      schoolId,
    });

    if (!pickupDoc) {
      return res.status(404).json({
        success: false,
        message: "Pickup document not found",
      });
    }

    /*
        Find pickup point
      */

    const point = pickupDoc.pickupPoints.find(
      (p) => p.pickupPointId === pickupPointId,
    );

    if (!point) {
      return res.status(404).json({
        success: false,
        message: "Pickup point not found",
      });
    }

    /*
        Prevent duplicate student
      */

    const alreadyExists = point.assignedStudents.some(
      (s) => s.userId === student.userId,
    );

    if (alreadyExists) {
      return res.status(400).json({
        success: false,
        message: "Student already assigned",
      });
    }

    /*
        Add student
      */

    point.assignedStudents.push(student);

    await pickupDoc.save();

    /*
        TODO:
        Publish Kafka event

        pickup-point-student-added
      */

    return res.status(200).json({
      success: true,

      message: "Student added successfully",

      data: pickupDoc,
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
3. REMOVE STUDENT
=====================================

Removes student from
pickup point
*/

exports.removeStudent = async (req, res) => {
  try {
    const { schoolId, pickupPointId, userId } = req.body;

    /*
        Find document
      */

    const pickupDoc = await PickupPoint.findOne({
      schoolId,
    });

    if (!pickupDoc) {
      return res.status(404).json({
        success: false,
        message: "Pickup document not found",
      });
    }

    /*
        Find pickup point
      */

    const point = pickupDoc.pickupPoints.find(
      (p) => p.pickupPointId === pickupPointId,
    );

    if (!point) {
      return res.status(404).json({
        success: false,
        message: "Pickup point not found",
      });
    }

    /*
        Remove student
      */

    point.assignedStudents = point.assignedStudents.filter(
      (s) => s.userId !== userId,
    );

    await pickupDoc.save();

    /*
        TODO:
        Publish Kafka event

        pickup-point-student-removed
      */

    return res.status(200).json({
      success: true,

      message: "Student removed successfully",

      data: pickupDoc,
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
4. REMOVE PICKUP POINT
=====================================

Removes complete
pickup point
*/
/*http://localhost:3000/api/pickupPoint/remove-student
{
  "schoolId": "SCH-12345678",

  "busNumber": "UP15AB1234",

  "pickupPointId":"PP-OLM6W8RU"
}*/
exports.removePickupPoint = async (req, res) => {
  try {
    const { schoolId, pickupPointId, busNumber } = req.body;

    /*
      =====================================
      VALIDATE REQUIRED FIELDS
      =====================================
      */

    if (!schoolId || !pickupPointId || !busNumber) {
      return res.status(400).json({
        success: false,

        message: "schoolId, busNumber, and pickupPointId are required",
      });
    }

    /*
      =====================================
      REMOVE PICKUP POINT
      =====================================
      */

    const updatedDoc = await PickupPoint.findOneAndUpdate(
      {
        schoolId,
        busNumber,
      },

      {
        $pull: {
          pickupPoints: {
            pickupPointId,
          },
        },
      },

      {
        returnDocument: "after",
      },
    );

    /*
      DOCUMENT NOT FOUND
      */

    if (!updatedDoc) {
      return res.status(404).json({
        success: false,

        message: "Pickup document not found",
      });
    }

    /*
      =====================================
      SYNC REDIS
      =====================================
      */

 /*
=====================================
SYNC REDIS
=====================================
*/

const redisKey =
  `pickup_points:${schoolId}:${busNumber}`;

const formattedPickupPoints =
  updatedDoc.pickupPoints.map(
    (point) => ({

      pickupPointId:
        point.pickupPointId,

      name:
        point.name,

      location: {

        lng:
          point.location.coordinates[0],

        lat:
          point.location.coordinates[1],
      },

      radius:
        updatedDoc.radius,

      assignedStudents:
        point.assignedStudents,
    })
  );

await redisClient.set(

  redisKey,

  JSON.stringify(
    formattedPickupPoints
  )
);

console.log(
  `✅ Redis updated: ${redisKey}`
);
    /*
        TODO:
        Publish Kafka event

        pickup-point-removed
      */

    return res.status(200).json({
      success: true,

      message: "Pickup point removed successfully",

      data: updatedDoc,
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
5. ADD ADDITIONAL PICKUP POINT
=====================================

Adds additional default
pickup point to bus
*/

exports.addPickupPoint = async (req, res) => {
  try {
    const { schoolId, busNumber, pickupPoints } = req.body;

    if (!Array.isArray(pickupPoints) || !pickupPoints.length) {
      return res.status(400).json({
        success: false,
        message: "pickupPoints array required",
      });
    }

    /*
      Add pickupPointId
    */

    const formattedPoints = pickupPoints.map((p) => ({
      ...p,
      pickupPointId: p.pickupPointId || `PP-${generateId()}`,
    }));

    /*
      Get existing pickupPointIds
    */

    const pickupDoc = await PickupPoint.findOne(
      { schoolId, busNumber },
      { "pickupPoints.pickupPointId": 1 }
    );

    if (!pickupDoc) {
      return res.status(404).json({
        success: false,
        message: "Pickup document not found",
      });
    }

    const existingIds = new Set(
      pickupDoc.pickupPoints.map((p) => p.pickupPointId)
    );

    /*
      Filter only new pickup points
    */

    const newPoints = formattedPoints.filter(
      (p) => !existingIds.has(p.pickupPointId)
    );

    if (!newPoints.length) {
      return res.status(400).json({
        success: false,
        message: "Pickup points already exist",
      });
    }

    /*
      MongoDB atomic update
    */

    const updatedDoc = await PickupPoint.findOneAndUpdate(
      { schoolId, busNumber },
      {
        $push: {
          pickupPoints: {
            $each: newPoints,
          },
        },
      },
      { new: true }
    );

    /*
      Redis sync
    */

    await redisClient.set(
      `pickup_points:${busNumber}`,
      JSON.stringify(updatedDoc.pickupPoints)
    );

    return res.status(200).json({
      success: true,
      message: "Pickup points added successfully",
      data: updatedDoc,
    });
  } catch (error) {
    console.log(error);

    return res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};
