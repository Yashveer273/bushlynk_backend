const PickupPoint = require("../models/PickupPoint");
const generateId = require("../utils/generateId");
const redisClient = require("../config/redis");

/*
=====================================
1. CREATE PICKUP POINT
=====================================
*/

exports.createPickupPoint = async (req, res) => {

  try {

    const {
      schoolId,
      busNumber,
      pickupPoints,
    } = req.body;

    /*
    =====================================
    VALIDATION
    =====================================
    */

    if (
      !schoolId ||
      !busNumber
    ) {

      return res.status(400).json({

        success: false,
        message:
          "schoolId and busNumber required",
      });
    }

    if (
      !pickupPoints ||
      !Array.isArray(pickupPoints) ||
      pickupPoints.length === 0
    ) {

      return res.status(400).json({

        success: false,
        message:
          "pickupPoints array required",
      });
    }

    /*
    =====================================
    PREPARE PICKUP POINTS
    =====================================
    */

    const preparedPickupPoints =
      pickupPoints.map((point) => {

        if (
          !point.name ||
          !point.location ||
          !Array.isArray(
            point.location.coordinates
          ) ||
          point.location.coordinates.length !== 2
        ) {

          throw new Error(
            "Invalid pickup point data"
          );
        }

        const lng =
          point.location.coordinates[0];

        const lat =
          point.location.coordinates[1];

        if (
          typeof lng !== "number" ||
          typeof lat !== "number"
        ) {

          throw new Error(
            "Coordinates must be numbers"
          );
        }

        return {

          pickupPointId:
            point.pickupPointId ||
            `PP-${generateId()}`,

          name:
            point.name,

          location:
            point.location,

          radius:
            point.radius || 100,

          /*
          IMPORTANT:
          MULTI CHILD SUPPORT
          */

          assignedStudents:
            Array.isArray(
              point.assignedStudents
            )
              ? point.assignedStudents.map(
                  (student) => ({

                    parentId:
                      student.parentId,

                    childId:
                      student.childId,

                    studentId:
                      student.studentId,

                    busNumber:
                      student.busNumber,
                  })
                )
              : [],
        };
      });

    /*
    =====================================
    FIND EXISTING DOCUMENT
    =====================================
    */

    const existing =
      await PickupPoint.findOne({

        schoolId,
        busNumber,
      });

    /*
    =====================================
    UPDATE EXISTING
    =====================================
    */

    if (existing) {

      existing.pickupPoints.push(
        ...preparedPickupPoints
      );

      await existing.save();

      /*
      REDIS SYNC
      */

      const redisKey =
        `pickup_points:${schoolId}:${busNumber}`;

      await redisClient.set(

        redisKey,

        JSON.stringify(
          existing.pickupPoints
        )
      );

      return res.status(200).json({

        success: true,

        message:
          "Pickup points added successfully",

        data: existing,
      });
    }

    /*
    =====================================
    CREATE NEW DOCUMENT
    =====================================
    */

    const newPickupPoint =
      await PickupPoint.create({

        schoolId,
        busNumber,

        pickupPoints:
          preparedPickupPoints,
      });

    /*
    REDIS SYNC
    */

    const redisKey =
      `pickup_points:${schoolId}:${busNumber}`;

    await redisClient.set(

      redisKey,

      JSON.stringify(
        newPickupPoint.pickupPoints
      )
    );

    return res.status(201).json({

      success: true,

      message:
        "Pickup document created successfully",

      data:
        newPickupPoint,
    });

  } catch (error) {

    console.log(error);

    return res.status(500).json({

      success: false,

      message:
        error.message || "Server error",
    });
  }
};


/*
=====================================
2. ADD STUDENT
=====================================
*/

exports.addStudent = async (req, res) => {

  try {

    const {
      schoolId,
      busNumber,
      pickupPointId,
      student,
    } = req.body;

    /*
    REQUIRED STRUCTURE
    student: {
      parentId,
      childId,
      studentId,
      busNumber
    }
    */

    if (
      !schoolId ||
      !busNumber ||
      !pickupPointId ||
      !student ||
      !student.parentId ||
      !student.childId
    ) {

      return res.status(400).json({

        success: false,

        message:
          "Required fields missing",
      });
    }

    /*
    =====================================
    FIND DOCUMENT
    =====================================
    */

    const pickupDoc =
      await PickupPoint.findOne({

        schoolId,
        busNumber,
      });

    if (!pickupDoc) {

      return res.status(404).json({

        success: false,
        message:
          "Pickup document not found",
      });
    }

    /*
    =====================================
    FIND PICKUP POINT
    =====================================
    */

    const point =
      pickupDoc.pickupPoints.find(

        (p) =>
          p.pickupPointId ===
          pickupPointId
      );

    if (!point) {

      return res.status(404).json({

        success: false,
        message:
          "Pickup point not found",
      });
    }

    /*
    =====================================
    PREVENT DUPLICATE CHILD
    =====================================
    */

    const alreadyExists =
      point.assignedStudents.some(

        (s) =>

          s.parentId ===
            student.parentId &&

          s.childId ===
            student.childId
      );

    if (alreadyExists) {

      return res.status(400).json({

        success: false,

        message:
          "Child already assigned",
      });
    }

    /*
    =====================================
    ADD CHILD
    =====================================
    */

    point.assignedStudents.push({

      parentId:
        student.parentId,

      childId:
        student.childId,

      studentId:
        student.studentId,

      busNumber:
        student.busNumber,
    });

    await pickupDoc.save();

    /*
    =====================================
    REDIS SYNC
    =====================================
    */

    const redisKey =
      `pickup_points:${schoolId}:${busNumber}`;

    await redisClient.set(

      redisKey,

      JSON.stringify(
        pickupDoc.pickupPoints
      )
    );

    return res.status(200).json({

      success: true,

      message:
        "Student added successfully",

      data:
        pickupDoc,
    });

  } catch (error) {

    console.log(error);

    return res.status(500).json({

      success: false,
      message:
        "Server error",
    });
  }
};


/*
=====================================
3. REMOVE STUDENT
=====================================
*/

exports.removeStudent = async (req, res) => {

  try {

    const {
      schoolId,
      busNumber,
      pickupPointId,
      parentId,
      childId,
    } = req.body;

    /*
    =====================================
    FIND DOCUMENT
    =====================================
    */

    const pickupDoc =
      await PickupPoint.findOne({

        schoolId,
        busNumber,
      });

    if (!pickupDoc) {

      return res.status(404).json({

        success: false,

        message:
          "Pickup document not found",
      });
    }

    /*
    =====================================
    FIND PICKUP POINT
    =====================================
    */

    const point =
      pickupDoc.pickupPoints.find(

        (p) =>
          p.pickupPointId ===
          pickupPointId
      );

    if (!point) {

      return res.status(404).json({

        success: false,

        message:
          "Pickup point not found",
      });
    }

    /*
    =====================================
    REMOVE SPECIFIC CHILD
    =====================================
    */

    point.assignedStudents =
      point.assignedStudents.filter(

        (s) =>

          !(
            s.parentId ===
              parentId &&

            s.childId ===
              childId
          )
      );

    await pickupDoc.save();

    /*
    =====================================
    REDIS SYNC
    =====================================
    */

    const redisKey =
      `pickup_points:${schoolId}:${busNumber}`;

    await redisClient.set(

      redisKey,

      JSON.stringify(
        pickupDoc.pickupPoints
      )
    );

    return res.status(200).json({

      success: true,

      message:
        "Student removed successfully",

      data:
        pickupDoc,
    });

  } catch (error) {

    console.log(error);

    return res.status(500).json({

      success: false,
      message:
        "Server error",
    });
  }
};


/*
=====================================
4. REMOVE PICKUP POINT
=====================================
*/

exports.removePickupPoint = async (req, res) => {

  try {

    const {
      schoolId,
      pickupPointId,
      busNumber,
    } = req.body;

    if (
      !schoolId ||
      !pickupPointId ||
      !busNumber
    ) {

      return res.status(400).json({

        success: false,

        message:
          "schoolId, busNumber and pickupPointId required",
      });
    }

    /*
    =====================================
    REMOVE PICKUP POINT
    =====================================
    */

    const updatedDoc =
      await PickupPoint.findOneAndUpdate(

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
          new: true,
        }
      );

    if (!updatedDoc) {

      return res.status(404).json({

        success: false,

        message:
          "Pickup document not found",
      });
    }

    /*
    =====================================
    REDIS SYNC
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
            point.radius || 100,

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

    return res.status(200).json({

      success: true,

      message:
        "Pickup point removed successfully",

      data:
        updatedDoc,
    });

  } catch (error) {

    console.log(error);

    return res.status(500).json({

      success: false,

      message:
        "Server error",
    });
  }
};


/*
=====================================
5. ADD ADDITIONAL PICKUP POINT
=====================================
*/

exports.addPickupPoint = async (req, res) => {

  try {

    const {
      schoolId,
      busNumber,
      pickupPoints,
    } = req.body;

    if (
      !Array.isArray(
        pickupPoints
      ) ||
      !pickupPoints.length
    ) {

      return res.status(400).json({

        success: false,

        message:
          "pickupPoints array required",
      });
    }

    /*
    =====================================
    FORMAT POINTS
    =====================================
    */

    const formattedPoints =
      pickupPoints.map((p) => ({

        ...p,

        pickupPointId:
          p.pickupPointId ||
          `PP-${generateId()}`,

        radius:
          p.radius || 100,

        assignedStudents:
          Array.isArray(
            p.assignedStudents
          )
            ? p.assignedStudents
            : [],
      }));

    /*
    =====================================
    FIND DOCUMENT
    =====================================
    */

    const pickupDoc =
      await PickupPoint.findOne({

        schoolId,
        busNumber,
      });

    if (!pickupDoc) {

      return res.status(404).json({

        success: false,

        message:
          "Pickup document not found",
      });
    }

    /*
    =====================================
    PREVENT DUPLICATES
    =====================================
    */

    const existingIds =
      new Set(

        pickupDoc.pickupPoints.map(

          (p) =>
            p.pickupPointId
        )
      );

    const newPoints =
      formattedPoints.filter(

        (p) =>
          !existingIds.has(
            p.pickupPointId
          )
      );

    if (!newPoints.length) {

      return res.status(400).json({

        success: false,

        message:
          "Pickup points already exist",
      });
    }

    /*
    =====================================
    UPDATE DOCUMENT
    =====================================
    */

    const updatedDoc =
      await PickupPoint.findOneAndUpdate(

        {
          schoolId,
          busNumber,
        },

        {
          $push: {

            pickupPoints: {
              $each:
                newPoints,
            },
          },
        },

        {
          new: true,
        }
      );

    /*
    =====================================
    REDIS SYNC
    =====================================
    */

    const redisKey =
      `pickup_points:${schoolId}:${busNumber}`;

    await redisClient.set(

      redisKey,

      JSON.stringify(
        updatedDoc.pickupPoints
      )
    );

    return res.status(200).json({

      success: true,

      message:
        "Pickup points added successfully",

      data:
        updatedDoc,
    });

  } catch (error) {

    console.log(error);

    return res.status(500).json({

      success: false,

      message:
        "Server error",
    });
  }
};