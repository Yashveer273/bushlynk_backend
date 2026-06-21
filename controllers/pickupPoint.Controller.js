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
      
      busNumber,
      pickupPoints,
    } = req.body;
   const { schoolId } = req.user;
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
  
      busNumber,
      pickupPointId,
      student,
    } = req.body;
   const { schoolId } = req.user;
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
  
      busNumber,
      pickupPointId,
      parentId,
      childId,
    } = req.body;
   const { schoolId } = req.user;
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
     
      pickupPointId,
      busNumber,
    } = req.body;
   const { schoolId } = req.user;
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
     
      busNumber,
      pickupPoints,
    } = req.body;
   const { schoolId } = req.user;
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
exports.editPickupPoint = async (req, res) => {
  try {
    const {
      busNumber,
      pickupPointId,
      name,
      radius,
      location,
    } = req.body;

    const { schoolId } = req.user;

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

    const pickupPoint =
      pickupDoc.pickupPoints.find(
        (p) =>
          p.pickupPointId ===
          pickupPointId
      );

    if (!pickupPoint) {
      return res.status(404).json({
        success: false,
        message:
          "Pickup point not found",
      });
    }

    /*
    =====================================
    UPDATE VALUES
    =====================================
    */

    if (name)
      pickupPoint.name = name;

    if (radius)
      pickupPoint.radius =
        radius;

    if (location)
      pickupPoint.location =
        location;

    await pickupDoc.save();

    /*
    =====================================
    REDIS UPDATE
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
        "Pickup point updated successfully",
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
exports.changeBusId = async (
  req,
  res
) => {
  try {
    const {
      oldBusNumber,
      newBusNumber,
    } = req.body;

    const { schoolId } =
      req.user;

    /*
    =====================================
    VALIDATION
    =====================================
    */

    if (
      !oldBusNumber ||
      !newBusNumber
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Old and new bus numbers are required",
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
        busNumber:
          oldBusNumber,
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
    CHECK NEW BUS EXISTS
    =====================================
    */

    const alreadyExists =
      await PickupPoint.findOne({
        schoolId,
        busNumber:
          newBusNumber,
      });

    if (alreadyExists) {
      return res.status(400).json({
        success: false,
        message:
          "New bus number already exists",
      });
    }

    /*
    =====================================
    UPDATE BUS NUMBER
    =====================================
    */

    pickupDoc.busNumber =
      newBusNumber;

    await pickupDoc.save();

    /*
    =====================================
    REDIS UPDATE
    =====================================
    */

    const oldRedisKey =
      `pickup_points:${schoolId}:${oldBusNumber}`;

    const newRedisKey =
      `pickup_points:${schoolId}:${newBusNumber}`;

    await redisClient.del(
      oldRedisKey
    );

    await redisClient.set(
      newRedisKey,

      JSON.stringify(
        pickupDoc.pickupPoints
      )
    );

    return res.status(200).json({
      success: true,
      message:
        "Bus ID updated successfully",
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
========================================
REMOVE COMPLETE BUS PICKUP POINTS
========================================
*/

exports.removeCompleteBusPickupPoints =
  async (req, res) => {

    try {

      const {
        busNumber,
      } = req.body;

      const {
        schoolId,
      } = req.user;

      /*
      ========================================
      VALIDATION
      ========================================
      */

      if (!busNumber) {

        return res.status(400).json({

          success: false,

          message:
            "Bus number is required",
        });
      }

      /*
      ========================================
      FIND DOCUMENT
      ========================================
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
      ========================================
      DELETE DOCUMENT
      ========================================
      */

      await PickupPoint.findOneAndDelete({

        schoolId,
        busNumber,
      });

      /*
      ========================================
      REMOVE REDIS CACHE
      ========================================
      */

      const redisKey =
        `pickup_points:${schoolId}:${busNumber}`;

      await redisClient.del(
        redisKey
      );

      /*
      ========================================
      RESPONSE
      ========================================
      */

      return res.status(200).json({

        success: true,

        message:
          "Complete bus pickup points removed successfully",
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
========================================
GET ALL BUSES WITH PICKUP POINTS
BUS PAGINATION + DEFAULT 5 PICKUP POINTS
========================================
*/

exports.getPaginatedBusesWithPickupPoints =
  async (req, res) => {

    try {

      /*
      ========================================
      QUERY PARAMS
      ========================================
      */

      const page =
        Number(req.query.page) || 1;

      const limit =
        Number(req.query.limit) || 5;

      const pickupPointLimit =
        Number(
          req.query.pickupPointLimit
        ) || 5;

      const search =
        req.query.search || "";

      const skip =
        (page - 1) * limit;

      const { schoolId } =
        req.user;

      /*
      ========================================
      FILTER
      ========================================
      */

      const filter = {
        schoolId,
      };

      if (search) {

        filter.busNumber = {

          $regex: search,
          $options: "i",
        };
      }

      /*
      ========================================
      TOTAL BUSES
      ========================================
      */

      const totalBuses =
        await PickupPoint.countDocuments(
          filter
        );

      /*
      ========================================
      GET BUSES
      ========================================
      */

      const buses =
        await PickupPoint.find(
          filter
        )

          .sort({
            createdAt: -1,
          })

          .skip(skip)

          .limit(limit)

          .lean();

      /*
      ========================================
      FORMAT RESPONSE
      ========================================
      */

      const formattedData =
        buses.map((bus) => ({

          _id: bus._id,

          busNumber:
            bus.busNumber,

          totalPickupPoints:
            bus.pickupPoints
              ?.length || 0,

          pickupPoints:
            bus.pickupPoints.slice(
              0,
              pickupPointLimit
            ),

          pickupPointPagination: {

            currentPage: 1,

            limit:
              pickupPointLimit,

            totalPickupPoints:
              bus.pickupPoints
                ?.length || 0,

            totalPages:
              Math.ceil(
                (bus.pickupPoints
                  ?.length || 0) /
                  pickupPointLimit
              ),
          },

          createdAt:
            bus.createdAt,
        }));

      /*
      ========================================
      RESPONSE
      ========================================
      */

      return res.status(200).json({

        success: true,

        message:
          "Buses fetched successfully",

        data: formattedData,

        pagination: {

          currentPage: page,

          limit,

          totalBuses,

          totalPages:
            Math.ceil(
              totalBuses / limit
            ),
        },
      });

    } catch (error) {

      console.log(error);

      return res.status(500).json({

        success: false,

        message:
          "Server Error",
      });
    }
  };

exports.getPickupPointById = async (
  req,
  res
) => {
  try {
    const { id } = req.params;
    const { schoolId } = req.user;

    const pickupDocument =
      await PickupPoint.findOne({
        schoolId,
        "pickupPoints.pickupPointId": id,
      }).lean();

    if (!pickupDocument) {
      return res.status(404).json({
        success: false,
        message: "Pickup point not found",
      });
    }

    const pickupPoint =
      pickupDocument.pickupPoints.find(
        (point) =>
          point.pickupPointId === id
      );

    return res.status(200).json({
      success: true,
      message:
        "Pickup point fetched successfully",
      data: pickupPoint,
    });
  } catch (error) {
    console.log(error);

    return res.status(500).json({
      success: false,
      message: "Server Error",
    });
  }
};
/*
========================================
GET PICKUP POINTS UNDER BUS
PICKUP POINT PAGINATION
========================================
*/

exports.getPickupPointsByBus =
  async (req, res) => {

    try {

      /*
      ========================================
      QUERY PARAMS
      ========================================
      */

      const page =
        Number(req.query.page) || 1;

      const limit =
        Number(req.query.limit) || 5;

      const skip =
        (page - 1) * limit;

      const { busNumber } =
        req.params;

      const { schoolId } =
        req.user;

      /*
      ========================================
      FIND BUS DOCUMENT
      ========================================
      */

      const pickupDoc =
        await PickupPoint.findOne({

          schoolId,
          busNumber,
        }).lean();

      if (!pickupDoc) {

        return res.status(404).json({

          success: false,

          message:
            "Bus pickup points not found",
        });
      }

      /*
      ========================================
      TOTAL PICKUP POINTS
      ========================================
      */

      const totalPickupPoints =
        pickupDoc.pickupPoints
          ?.length || 0;

      /*
      ========================================
      REVERSE ORDER
      LATEST PICKUP POINT FIRST
      ========================================
      */

      const reversedPickupPoints =
        [...pickupDoc.pickupPoints]
          .reverse();

      /*
      ========================================
      PAGINATED PICKUP POINTS
      ========================================
      */

      const paginatedPickupPoints =
        reversedPickupPoints.slice(

          skip,
          skip + limit
        );

      /*
      ========================================
      RESPONSE
      ========================================
      */

      return res.status(200).json({

        success: true,

        message:
          "Pickup points fetched successfully",

        data: {

          busNumber:
            pickupDoc.busNumber,

          pickupPoints:
            paginatedPickupPoints,
        },

        pagination: {

          currentPage: page,

          limit,

          totalPickupPoints,

          totalPages:
            Math.ceil(
              totalPickupPoints /
                limit
            ),
        },
      });

    } catch (error) {

      console.log(error);

      return res.status(500).json({

        success: false,

        message:
          "Server Error",
      });
    }
  };