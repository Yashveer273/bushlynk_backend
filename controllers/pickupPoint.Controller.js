const PickupPoint = require("../models/PickupPoint");
const students = require("../models/students");
const generateId = require("../utils/generateId");
const redisClient = require("../config/redis");
const mongoose = require("mongoose");

/*
=====================================
1. CREATE PICKUP POINT
=====================================
*/

exports.createPickupPoint = async (req, res) => {
  try {
    const { busNumber, pickupPoints } = req.body;
    const { schoolId } = req.user;
    /*
    =====================================
    VALIDATION
    =====================================
    */

    if (!schoolId || !busNumber) {
      return res.status(400).json({
        success: false,
        message: "schoolId and busNumber required",
      });
    }

    if (
      !pickupPoints ||
      !Array.isArray(pickupPoints) ||
      pickupPoints.length === 0
    ) {
      return res.status(400).json({
        success: false,
        message: "pickupPoints array required",
      });
    }

    /*
    =====================================
    PREPARE PICKUP POINTS
    =====================================
    */

    const preparedPickupPoints = pickupPoints.map((point) => {
      if (
        !point.name ||
        !point.location ||
        !Array.isArray(point.location.coordinates) ||
        point.location.coordinates.length !== 2
      ) {
        throw new Error("Invalid pickup point data");
      }

      const lng = point.location.coordinates[0];

      const lat = point.location.coordinates[1];

      if (typeof lng !== "number" || typeof lat !== "number") {
        throw new Error("Coordinates must be numbers");
      }

      return {
        pickupPointId: point.pickupPointId || `PP-${generateId()}`,

        name: point.name,
        status: "PUBLISHED",
        createdBy: "ADMIN",
        lastModifiedBy: "Admin",
        location: point.location,

        radius: point.radius || 100,

        /*
          IMPORTANT:
          MULTI CHILD SUPPORT
          */

        assignedStudents: Array.isArray(point.assignedStudents)
          ? point.assignedStudents.map((student) => ({
              parentId: student.parentId,

              childId: student.childId,

              studentId: student.studentId,

              busNumber: student.busNumber,
            }))
          : [],
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
    UPDATE EXISTING
    =====================================
    */

    if (existing) {
      existing.pickupPoints.push(...preparedPickupPoints);

      await existing.save();

      /*
      REDIS SYNC
      */

      const redisKey = `pickup_points:${schoolId}:${busNumber}`;

      await redisClient.set(
        redisKey,

        JSON.stringify(existing.pickupPoints),
      );

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
    REDIS SYNC
    */

    const redisKey = `pickup_points:${schoolId}:${busNumber}`;

    await redisClient.set(
      redisKey,

      JSON.stringify(newPickupPoint.pickupPoints),
    );

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
exports.updateSinglePickupPointStatus = async (req, res) => {
  try {
    const { busNumber, pickupPointId, status } = req.body;
    const { schoolId } = req.user;

    // Use updateOne with the positional $ operator to target the specific point
    const result = await PickupPoint.updateOne(
      {
        schoolId,
        busNumber,
        "pickupPoints.pickupPointId": pickupPointId,
      },
      {
        $set: {
          "pickupPoints.$.status": status,
          "pickupPoints.$.lastModifiedBy": "ADMIN",
        },
      },
    );

    if (result.matchedCount === 0) {
      return res
        .status(404)
        .json({ success: false, message: "Route or Pickup Point not found" });
    }

    // Optional: Refresh Redis cache (since the DB is now updated)
    const updatedDoc = await PickupPoint.findOne({ schoolId, busNumber });
    await redisClient.set(
      `pickup_points:${schoolId}:${busNumber}`,
      JSON.stringify(updatedDoc.pickupPoints),
    );

    return res.status(200).json({
      success: true,
      message: "Pickup point status updated successfully",
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};
exports.createPickupPointByDriver = async (req, res) => {
  try {
    const { busNumber, pickupPoints } = req.body;
    const  schoolId  = req.schoolId;
    const driver_phone = req.driver.phone;
  
    /*
    =====================================
    VALIDATION
    =====================================
    */

    if (!schoolId || !driver_phone || !busNumber) {
      return res.status(400).json({
        success: false,
        message: "schoolId, driver phone, and busNumber required",
      });
    }

    if (
      !pickupPoints ||
      !Array.isArray(pickupPoints) ||
      pickupPoints.length === 0
    ) {
      return res.status(400).json({
        success: false,
        message: "pickupPoints array required",
      });
    }

    /*
    =====================================
    PREPARE PICKUP POINTS
    =====================================
    */

    const preparedPickupPoints = pickupPoints.map((point) => {
      if (
        !point.name ||
        !point.location ||
        !Array.isArray(point.location.coordinates) ||
        point.location.coordinates.length !== 2
      ) {
        throw new Error("Invalid pickup point data");
      }

      const lng = point.location.coordinates[0];

      const lat = point.location.coordinates[1];

      if (typeof lng !== "number" || typeof lat !== "number") {
        throw new Error("Coordinates must be numbers");
      }

      return {
        pickupPointId: point.pickupPointId || `PP-${generateId()}`,

        name: point.name,
        status: "DRAFT",
        createdBy: "DRIVER",
        lastModifiedBy: driver_phone,
        location: point.location,

        radius: point.radius || 100,

        /*
          IMPORTANT:
          MULTI CHILD SUPPORT
          */

        assignedStudents: Array.isArray(point.assignedStudents)
          ? point.assignedStudents.map((student) => ({
              parentId: student.parentId,

              childId: student.childId,

              studentId: student.studentId,

              busNumber: student.busNumber,
            }))
          : [],
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
    UPDATE EXISTING
    =====================================
    */

    if (existing) {
      existing.pickupPoints.push(...preparedPickupPoints);

      await existing.save();

      /*
      REDIS SYNC
      */

      const redisKey = `pickup_points:${schoolId}:${busNumber}`;

      await redisClient.set(
        redisKey,

        JSON.stringify(existing.pickupPoints),
      );

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
    REDIS SYNC
    */

    const redisKey = `pickup_points:${schoolId}:${busNumber}`;

    await redisClient.set(
      redisKey,

      JSON.stringify(newPickupPoint.pickupPoints),
    );

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
    EXPECTED REQUEST BODY

    {
      "schoolId": "YTFTY",
      "busNumber": "UP15AB123",
      "pickupPointId": "PP-49PY694I",
      "student": {
        "parentId": "4APXHGTI",
        "studentId": "STU-819252-11"
      }
    }
    */

    /*
    =====================================
    REQUIRED FIELD VALIDATION
    =====================================
    */

    if (
      !schoolId ||
      !busNumber ||
      !pickupPointId ||
    
      !student.parentId ||
      !student.studentId
    ) {
      return res.status(400).json({
        success: false,
        code: "REQUIRED_FIELDS_MISSING",
        message:
          "schoolId, busNumber, pickupPointId, parentId and studentId are required",
      });
    }

    const cleanSchoolId = String(schoolId).trim();
    const cleanBusNumber = String(busNumber).trim();
    const cleanPickupPointId = String(pickupPointId).trim();
    const cleanParentId = String(student.parentId).trim();
    const cleanStudentId = String(student.studentId).trim();

    if (
      !cleanSchoolId ||
      !cleanBusNumber ||
      !cleanPickupPointId ||
      !cleanParentId ||
      !cleanStudentId
    ) {
      return res.status(400).json({
        success: false,
        code: "EMPTY_FIELD_VALUE",
        message: "Required fields cannot contain empty values",
      });
    }

    /*
    =====================================
    FIND TARGET BUS PICKUP DOCUMENT
    =====================================
    */

    const pickupDoc = await PickupPoint.findOne({
      schoolId: cleanSchoolId,
      busNumber: cleanBusNumber,
    });

    if (!pickupDoc) {
      return res.status(404).json({
        success: false,
        code: "PICKUP_DOCUMENT_NOT_FOUND",
        message:
          "No pickup-point document exists for the selected school and bus",

        requestedAssignment: {
          schoolId: cleanSchoolId,
          busNumber: cleanBusNumber,
          pickupPointId: cleanPickupPointId,
          parentId: cleanParentId,
          studentId: cleanStudentId,
        },
      });
    }

    /*
    =====================================
    FIND TARGET PICKUP POINT
    =====================================
    */

    const targetPoint = pickupDoc.pickupPoints.find(
      (point) =>
        String(point.pickupPointId).trim() === cleanPickupPointId,
    );

    if (!targetPoint) {
      return res.status(404).json({
        success: false,
        code: "PICKUP_POINT_NOT_FOUND",
        message:
          "The selected pickup point does not exist on the selected bus",

        requestedAssignment: {
          schoolId: cleanSchoolId,
          busNumber: cleanBusNumber,
          pickupPointId: cleanPickupPointId,
          parentId: cleanParentId,
          studentId: cleanStudentId,
        },
      });
    }

    /*
    =====================================
    FIND PARENT USING:
    SCHOOL ID + PARENT ID
    =====================================
    */

    const parentDoc = await students.findOne({
      schoolId: cleanSchoolId,
      parentId: cleanParentId,
    });

    if (!parentDoc) {
      return res.status(404).json({
        success: false,
        code: "PARENT_NOT_FOUND",
        message:
          "Parent was not found using the provided school ID and parent ID",

        requestedAssignment: {
          schoolId: cleanSchoolId,
          parentId: cleanParentId,
          studentId: cleanStudentId,
          busNumber: cleanBusNumber,
          pickupPointId: cleanPickupPointId,
        },
      });
    }

    /*
    =====================================
    CHECK PARENT STATUS
    =====================================
    */

    if (parentDoc.status?.active === false) {
      return res.status(400).json({
        success: false,
        code: "PARENT_INACTIVE",
        message:
          "The parent account is inactive and cannot receive a new assignment",

        requestedAssignment: {
          schoolId: cleanSchoolId,
          parentId: cleanParentId,
          studentId: cleanStudentId,
          busNumber: cleanBusNumber,
          pickupPointId: cleanPickupPointId,
        },
      });
    }

    /*
    =====================================
    FIND STUDENT INSIDE CHILDREN ARRAY
    =====================================
    */

    const child = parentDoc.children.find(
      (item) =>
        String(item.studentId).trim() === cleanStudentId,
    );

    if (!child) {
      return res.status(404).json({
        success: false,
        code: "STUDENT_NOT_FOUND",
        message:
          "The student was not found inside this parent's children array",

        requestedAssignment: {
          schoolId: cleanSchoolId,
          parentId: cleanParentId,
          studentId: cleanStudentId,
          busNumber: cleanBusNumber,
          pickupPointId: cleanPickupPointId,
        },
      });
    }

    /*
    =====================================
    CHECK STUDENT STATUS
    =====================================
    */

    if (child.status?.active === false) {
      return res.status(400).json({
        success: false,
        code: "STUDENT_INACTIVE",
        message:
          "The student is inactive and cannot be assigned to a pickup point",

        requestedAssignment: {
          schoolId: cleanSchoolId,
          parentId: cleanParentId,
          studentId: cleanStudentId,
          busNumber: cleanBusNumber,
          pickupPointId: cleanPickupPointId,
        },
      });
    }

    /*
    =====================================
    CHECK STUDENT ACROSS ALL BUSES
    AND ALL PICKUP POINTS OF THE SCHOOL

    This identifies:

    1. Same bus and same pickup point
    2. Same bus and different pickup point
    3. Different bus and pickup point
    =====================================
    */

    const existingPickupDocument = await PickupPoint.findOne({
      schoolId: cleanSchoolId,

      pickupPoints: {
        $elemMatch: {
          assignedStudents: {
            $elemMatch: {
              parentId: cleanParentId,
              studentId: cleanStudentId,
            },
          },
        },
      },
    });

    if (existingPickupDocument) {
      const existingPoint =
        existingPickupDocument.pickupPoints.find((point) =>
          point.assignedStudents.some(
            (assignedStudent) =>
              String(assignedStudent.parentId).trim() ===
                cleanParentId &&
              String(assignedStudent.studentId).trim() ===
                cleanStudentId,
          ),
        );

      if (existingPoint) {
        const existingBusNumber = String(
          existingPickupDocument.busNumber,
        ).trim();

        const existingPickupPointId = String(
          existingPoint.pickupPointId,
        ).trim();

        const sameBus =
          existingBusNumber === cleanBusNumber;

        const samePickupPoint =
          existingPickupPointId === cleanPickupPointId;

        /*
        =====================================
        SAME BUS + SAME PICKUP POINT
        =====================================
        */

        if (sameBus && samePickupPoint) {
          return res.status(409).json({
            success: false,
            code: "STUDENT_ALREADY_ASSIGNED_SAME_POINT",
            conflictType: "SAME_BUS_SAME_PICKUP_POINT",

            message:
              "This student is already assigned to this pickup point",

            existingAssignment: {
              schoolId: cleanSchoolId,
              parentId: cleanParentId,
              studentId: cleanStudentId,
              busNumber: existingBusNumber,
              pickupPointId: existingPickupPointId,
              pickupPointName: existingPoint.name || null,
            },

            requestedAssignment: {
              schoolId: cleanSchoolId,
              parentId: cleanParentId,
              studentId: cleanStudentId,
              busNumber: cleanBusNumber,
              pickupPointId: cleanPickupPointId,
              pickupPointName: targetPoint.name || null,
            },

            adminAction:
              "The student is already assigned here, so no new assignment is required.",
          });
        }

        /*
        =====================================
        SAME BUS + DIFFERENT PICKUP POINT
        =====================================
        */

        if (sameBus && !samePickupPoint) {
          return res.status(409).json({
            success: false,
            code: "STUDENT_ASSIGNED_OTHER_POINT_SAME_BUS",
            conflictType: "SAME_BUS_DIFFERENT_PICKUP_POINT",

            message:
              "This student is already assigned to another pickup point on the same bus",

            existingAssignment: {
              schoolId: cleanSchoolId,
              parentId: cleanParentId,
              studentId: cleanStudentId,
              busNumber: existingBusNumber,
              pickupPointId: existingPickupPointId,
              pickupPointName: existingPoint.name || null,
            },

            requestedAssignment: {
              schoolId: cleanSchoolId,
              parentId: cleanParentId,
              studentId: cleanStudentId,
              busNumber: cleanBusNumber,
              pickupPointId: cleanPickupPointId,
              pickupPointName: targetPoint.name || null,
            },

            adminAction:
              "Remove the student from the existing pickup point and then submit the new assignment again.",
          });
        }

        /*
        =====================================
        DIFFERENT BUS
        =====================================
        */

        if (!sameBus) {
          return res.status(409).json({
            success: false,
            code: "STUDENT_ASSIGNED_OTHER_BUS",
            conflictType: "DIFFERENT_BUS",

            message:
              "This student is already assigned to another bus and pickup point",

            existingAssignment: {
              schoolId: cleanSchoolId,
              parentId: cleanParentId,
              studentId: cleanStudentId,
              busNumber: existingBusNumber,
              pickupPointId: existingPickupPointId,
              pickupPointName: existingPoint.name || null,
            },

            requestedAssignment: {
              schoolId: cleanSchoolId,
              parentId: cleanParentId,
              studentId: cleanStudentId,
              busNumber: cleanBusNumber,
              pickupPointId: cleanPickupPointId,
              pickupPointName: targetPoint.name || null,
            },

            adminAction:
              "Remove the student from the existing bus and pickup point before adding the new assignment.",
          });
        }
      }
    }

    /*
    =====================================
    CHECK CHILD ARRAY ASSIGNMENT

    This catches inconsistent data where
    busNumber or pickupPointId exists inside
    the child record, but the student is not
    present in the PickupPoint document.
    =====================================
    */

    const existingChildBusNumber = child.busNumber
      ? String(child.busNumber).trim()
      : "";

    const existingChildPickupPointId = child.pickupPointId
      ? String(child.pickupPointId).trim()
      : "";

    const childHasAssignment =
      Boolean(existingChildBusNumber) ||
      Boolean(existingChildPickupPointId);

    if (childHasAssignment) {
      const sameChildBus =
        existingChildBusNumber === cleanBusNumber;

      const sameChildPickupPoint =
        existingChildPickupPointId === cleanPickupPointId;

      /*
      =====================================
      CHILD HAS SAME ASSIGNMENT BUT
      PICKUP DOCUMENT DOES NOT
      =====================================
      */

      if (sameChildBus && sameChildPickupPoint) {
        return res.status(409).json({
          success: false,
          code: "CHILD_RECORD_HAS_SAME_ASSIGNMENT",
          conflictType: "INCONSISTENT_SAME_ASSIGNMENT",

          message:
            "The child record contains this bus and pickup point, but the pickup-point record does not contain the student",

          existingAssignment: {
            schoolId: cleanSchoolId,
            parentId: cleanParentId,
            studentId: cleanStudentId,
            busNumber: existingChildBusNumber || null,
            pickupPointId:
              existingChildPickupPointId || null,
            source: "CHILD_RECORD",
          },

          requestedAssignment: {
            schoolId: cleanSchoolId,
            parentId: cleanParentId,
            studentId: cleanStudentId,
            busNumber: cleanBusNumber,
            pickupPointId: cleanPickupPointId,
            pickupPointName: targetPoint.name || null,
          },

          adminAction:
            "Check and repair the child assignment before adding the student again.",
        });
      }

      /*
      =====================================
      CHILD HAS ANOTHER ASSIGNMENT
      =====================================
      */

      return res.status(409).json({
        success: false,
        code: "CHILD_RECORD_HAS_OTHER_ASSIGNMENT",
        conflictType: "CHILD_RECORD_DIFFERENT_ASSIGNMENT",

        message:
          "The child record already contains another bus or pickup point assignment",

        existingAssignment: {
          schoolId: cleanSchoolId,
          parentId: cleanParentId,
          studentId: cleanStudentId,
          busNumber: existingChildBusNumber || null,
          pickupPointId:
            existingChildPickupPointId || null,
          source: "CHILD_RECORD",
        },

        requestedAssignment: {
          schoolId: cleanSchoolId,
          parentId: cleanParentId,
          studentId: cleanStudentId,
          busNumber: cleanBusNumber,
          pickupPointId: cleanPickupPointId,
          pickupPointName: targetPoint.name || null,
        },

        adminAction:
          "Remove the previous bus and pickup-point assignment before adding the new assignment.",
      });
    }

    /*
    =====================================
    ALL VALIDATIONS COMPLETED

    NOW ADD STUDENT TO PICKUP POINT
    =====================================
    */

    targetPoint.assignedStudents.push({
      parentId: cleanParentId,
      studentId: cleanStudentId,
      busNumber: cleanBusNumber,
    });

    /*
    =====================================
    UPDATE CHILD ARRAY
    =====================================
    */

    child.busNumber = cleanBusNumber;
    child.pickupPointId = cleanPickupPointId;

    /*
    =====================================
    SAVE PICKUP DOCUMENT
    =====================================
    */

    await pickupDoc.save();

    /*
    =====================================
    SAVE PARENT DOCUMENT

    If parent save fails, remove the newly
    added pickup-point assignment.
    =====================================
    */

    try {
      await parentDoc.save();
    } catch (parentSaveError) {
      targetPoint.assignedStudents =
        targetPoint.assignedStudents.filter(
          (assignedStudent) =>
            !(
              String(assignedStudent.parentId).trim() ===
                cleanParentId &&
              String(assignedStudent.studentId).trim() ===
                cleanStudentId
            ),
        );

      await pickupDoc.save();

      throw parentSaveError;
    }

    /*
    =====================================
    REDIS SYNC
    =====================================
    */

    const redisKey =
      `pickup_points:${cleanSchoolId}:${cleanBusNumber}`;

    try {
      await redisClient.set(
        redisKey,
        JSON.stringify(pickupDoc.pickupPoints),
      );
    } catch (redisError) {
      console.error(
        "Redis synchronization failed:",
        redisError,
      );
    }

    /*
    =====================================
    SUCCESS RESPONSE
    =====================================
    */

    return res.status(200).json({
      success: true,
      code: "STUDENT_ASSIGNED_SUCCESSFULLY",
      message:
        "Student assigned to pickup point successfully",

      assignment: {
        schoolId: cleanSchoolId,
        parentId: cleanParentId,
        studentId: cleanStudentId,
        busNumber: cleanBusNumber,
        pickupPointId: cleanPickupPointId,
        pickupPointName: targetPoint.name || null,
      },
    });
  } catch (error) {
    console.error("Add student error:", error);

    if (error.name === "ValidationError") {
      return res.status(400).json({
        success: false,
        code: "DATABASE_VALIDATION_FAILED",
        message: "Database validation failed",
        error: error.message,
      });
    }

    return res.status(500).json({
      success: false,
      code: "ADD_STUDENT_SERVER_ERROR",
      message: "Server error while assigning student",
      error: error.message,
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
    const { busNumber, pickupPointId, parentId, childId } = req.body;
    const { schoolId } = req.user;
    /*
    =====================================
    FIND DOCUMENT
    =====================================
    */

    const pickupDoc = await PickupPoint.findOne({
      schoolId,
      busNumber,
    });

    if (!pickupDoc) {
      return res.status(404).json({
        success: false,

        message: "Pickup document not found",
      });
    }

    /*
    =====================================
    FIND PICKUP POINT
    =====================================
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
    =====================================
    REMOVE SPECIFIC CHILD
    =====================================
    */

    point.assignedStudents = point.assignedStudents.filter(
      (s) => !(s.parentId === parentId && s.childId === childId),
    );

    await pickupDoc.save();

    /*
    =====================================
    REDIS SYNC
    =====================================
    */

    const redisKey = `pickup_points:${schoolId}:${busNumber}`;

    await redisClient.set(
      redisKey,

      JSON.stringify(pickupDoc.pickupPoints),
    );

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
*/

exports.removePickupPoint = async (req, res) => {
  try {
    const { pickupPointId, busNumber } = req.body;
    const { schoolId } = req.user;
    if (!schoolId || !pickupPointId || !busNumber) {
      return res.status(400).json({
        success: false,

        message: "schoolId, busNumber and pickupPointId required",
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
        new: true,
      },
    );

    if (!updatedDoc) {
      return res.status(404).json({
        success: false,

        message: "Pickup document not found",
      });
    }

    /*
    =====================================
    REDIS SYNC
    =====================================
    */

    const redisKey = `pickup_points:${schoolId}:${busNumber}`;

    const formattedPickupPoints = updatedDoc.pickupPoints.map((point) => ({
      pickupPointId: point.pickupPointId,

      name: point.name,

      location: {
        lng: point.location.coordinates[0],

        lat: point.location.coordinates[1],
      },

      radius: point.radius || 100,

      assignedStudents: point.assignedStudents,
    }));

    await redisClient.set(
      redisKey,

      JSON.stringify(formattedPickupPoints),
    );

    console.log(`✅ Redis updated: ${redisKey}`);

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
*/

exports.addPickupPoint = async (req, res) => {
  try {
    const { busNumber, pickupPoints } = req.body;
    const { schoolId } = req.user;
    if (!Array.isArray(pickupPoints) || !pickupPoints.length) {
      return res.status(400).json({
        success: false,

        message: "pickupPoints array required",
      });
    }

    /*
    =====================================
    FORMAT POINTS
    =====================================
    */

    const formattedPoints = pickupPoints.map((p) => ({
      ...p,

      pickupPointId: p.pickupPointId || `PP-${generateId()}`,

      radius: p.radius || 100,

      assignedStudents: Array.isArray(p.assignedStudents)
        ? p.assignedStudents
        : [],
    }));

    /*
    =====================================
    FIND DOCUMENT
    =====================================
    */

    const pickupDoc = await PickupPoint.findOne({
      schoolId,
      busNumber,
    });

    if (!pickupDoc) {
      return res.status(404).json({
        success: false,

        message: "Pickup document not found",
      });
    }

    /*
    =====================================
    PREVENT DUPLICATES
    =====================================
    */

    const existingIds = new Set(
      pickupDoc.pickupPoints.map((p) => p.pickupPointId),
    );

    const newPoints = formattedPoints.filter(
      (p) => !existingIds.has(p.pickupPointId),
    );

    if (!newPoints.length) {
      return res.status(400).json({
        success: false,

        message: "Pickup points already exist",
      });
    }

    /*
    =====================================
    UPDATE DOCUMENT
    =====================================
    */

    const updatedDoc = await PickupPoint.findOneAndUpdate(
      {
        schoolId,
        busNumber,
      },

      {
        $push: {
          pickupPoints: {
            $each: newPoints,
          },
        },
      },

      {
        new: true,
      },
    );

    /*
    =====================================
    REDIS SYNC
    =====================================
    */

    const redisKey = `pickup_points:${schoolId}:${busNumber}`;

    await redisClient.set(
      redisKey,

      JSON.stringify(updatedDoc.pickupPoints),
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
exports.editPickupPoint = async (req, res) => {
  try {
    const { busNumber, pickupPointId, name, radius, location } = req.body;

    const { schoolId } = req.user;

    /*
    =====================================
    FIND DOCUMENT
    =====================================
    */

    const pickupDoc = await PickupPoint.findOne({
      schoolId,
      busNumber,
    });

    if (!pickupDoc) {
      return res.status(404).json({
        success: false,
        message: "Pickup document not found",
      });
    }

    /*
    =====================================
    FIND PICKUP POINT
    =====================================
    */

    const pickupPoint = pickupDoc.pickupPoints.find(
      (p) => p.pickupPointId === pickupPointId,
    );

    if (!pickupPoint) {
      return res.status(404).json({
        success: false,
        message: "Pickup point not found",
      });
    }

    /*
    =====================================
    UPDATE VALUES
    =====================================
    */

    if (name) pickupPoint.name = name;

    if (radius) pickupPoint.radius = radius;

    if (location) pickupPoint.location = location;

    await pickupDoc.save();

    /*
    =====================================
    REDIS UPDATE
    =====================================
    */

    const redisKey = `pickup_points:${schoolId}:${busNumber}`;

    await redisClient.set(redisKey, JSON.stringify(pickupDoc.pickupPoints));

    return res.status(200).json({
      success: true,
      message: "Pickup point updated successfully",
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
exports.changeBusId = async (req, res) => {
  try {
    const { oldBusNumber, newBusNumber } = req.body;

    const { schoolId } = req.user;

    /*
    =====================================
    VALIDATION
    =====================================
    */

    if (!oldBusNumber || !newBusNumber) {
      return res.status(400).json({
        success: false,
        message: "Old and new bus numbers are required",
      });
    }

    /*
    =====================================
    FIND DOCUMENT
    =====================================
    */

    const pickupDoc = await PickupPoint.findOne({
      schoolId,
      busNumber: oldBusNumber,
    });

    if (!pickupDoc) {
      return res.status(404).json({
        success: false,
        message: "Pickup document not found",
      });
    }

    /*
    =====================================
    CHECK NEW BUS EXISTS
    =====================================
    */

    const alreadyExists = await PickupPoint.findOne({
      schoolId,
      busNumber: newBusNumber,
    });

    if (alreadyExists) {
      return res.status(400).json({
        success: false,
        message: "New bus number already exists",
      });
    }

    /*
    =====================================
    UPDATE BUS NUMBER
    =====================================
    */

    pickupDoc.busNumber = newBusNumber;

    await pickupDoc.save();

    /*
    =====================================
    REDIS UPDATE
    =====================================
    */

    const oldRedisKey = `pickup_points:${schoolId}:${oldBusNumber}`;

    const newRedisKey = `pickup_points:${schoolId}:${newBusNumber}`;

    await redisClient.del(oldRedisKey);

    await redisClient.set(
      newRedisKey,

      JSON.stringify(pickupDoc.pickupPoints),
    );

    return res.status(200).json({
      success: true,
      message: "Bus ID updated successfully",
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

exports.removeCompleteBusPickupPoints = async (req, res) => {
  try {
    const { busNumber } = req.body;

    const { schoolId } = req.user;

    /*
      ========================================
      VALIDATION
      ========================================
      */

    if (!busNumber) {
      return res.status(400).json({
        success: false,

        message: "Bus number is required",
      });
    }

    /*
      ========================================
      FIND DOCUMENT
      ========================================
      */

    const pickupDoc = await PickupPoint.findOne({
      schoolId,
      busNumber,
    });

    if (!pickupDoc) {
      return res.status(404).json({
        success: false,

        message: "Pickup document not found",
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

    const redisKey = `pickup_points:${schoolId}:${busNumber}`;

    await redisClient.del(redisKey);

    /*
      ========================================
      RESPONSE
      ========================================
      */

    return res.status(200).json({
      success: true,

      message: "Complete bus pickup points removed successfully",
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
GET ALL BUSES WITH PICKUP POINTS
BUS PAGINATION + DEFAULT 5 PICKUP POINTS
========================================
*/

exports.getPaginatedBusesWithPickupPoints = async (req, res) => {
  try {
    /*
      ========================================
      QUERY PARAMS
      ========================================
      */

    const page = Number(req.query.page) || 1;

    const limit = Number(req.query.limit) || 5;

    const pickupPointLimit = Number(req.query.pickupPointLimit) || 5;

    const search = req.query.search || "";

    const skip = (page - 1) * limit;

    const { schoolId } = req.user;

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

    const totalBuses = await PickupPoint.countDocuments(filter);

    /*
      ========================================
      GET BUSES
      ========================================
      */

    const buses = await PickupPoint.find(filter)

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

    const formattedData = buses.map((bus) => ({
      _id: bus._id,

      busNumber: bus.busNumber,

      totalPickupPoints: bus.pickupPoints?.length || 0,

      pickupPoints: bus.pickupPoints.slice(0, pickupPointLimit),

      pickupPointPagination: {
        currentPage: 1,

        limit: pickupPointLimit,

        totalPickupPoints: bus.pickupPoints?.length || 0,

        totalPages: Math.ceil(
          (bus.pickupPoints?.length || 0) / pickupPointLimit,
        ),
      },

      createdAt: bus.createdAt,
    }));

    /*
      ========================================
      RESPONSE
      ========================================
      */

    return res.status(200).json({
      success: true,

      message: "Buses fetched successfully",

      data: formattedData,

      pagination: {
        currentPage: page,

        limit,

        totalBuses,

        totalPages: Math.ceil(totalBuses / limit),
      },
    });
  } catch (error) {
    console.log(error);

    return res.status(500).json({
      success: false,

      message: "Server Error",
    });
  }
};

exports.getPickupPointById = async (req, res) => {
  try {
    const { id } = req.params;
    const { schoolId } = req.user;

    const pickupDocument = await PickupPoint.findOne({
      schoolId,
      "pickupPoints.pickupPointId": id,
    }).lean();

    if (!pickupDocument) {
      return res.status(404).json({
        success: false,
        message: "Pickup point not found",
      });
    }

    const pickupPoint = pickupDocument.pickupPoints.find(
      (point) => point.pickupPointId === id,
    );

    return res.status(200).json({
      success: true,
      message: "Pickup point fetched successfully",
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

exports.admin_getPickupPointsByBus = async (req, res) => {
  try {
    /*
      ========================================
      QUERY PARAMS
      ========================================
      */

    const page = Number(req.query.page) || 1;

    const limit = Number(req.query.limit) || 5;

    const skip = (page - 1) * limit;

    const { busNumber } = req.params;

    const { schoolId } = req.user;

    /*
      ========================================
      FIND BUS DOCUMENT
      ========================================
      */

    const pickupDoc = await PickupPoint.findOne({
      schoolId,
      busNumber,
    }).lean();

    if (!pickupDoc) {
      return res.status(404).json({
        success: false,

        message: "Bus pickup points not found",
      });
    }

    /*
      ========================================
      TOTAL PICKUP POINTS
      ========================================
      */

    const totalPickupPoints = pickupDoc.pickupPoints?.length || 0;

    /*
      ========================================
      REVERSE ORDER
      LATEST PICKUP POINT FIRST
      ========================================
      */

    const reversedPickupPoints = [...pickupDoc.pickupPoints].reverse();

    /*
      ========================================
      PAGINATED PICKUP POINTS
      ========================================
      */

    const paginatedPickupPoints = reversedPickupPoints.slice(
      skip,
      skip + limit,
    );

    /*
      ========================================
      RESPONSE
      ========================================
      */

    return res.status(200).json({
      success: true,

      message: "Pickup points fetched successfully",

      data: {
        busNumber: pickupDoc.busNumber,

        pickupPoints: paginatedPickupPoints,
      },

      pagination: {
        currentPage: page,

        limit,

        totalPickupPoints,

        totalPages: Math.ceil(totalPickupPoints / limit),
      },
    });
  } catch (error) {
    console.log(error);

    return res.status(500).json({
      success: false,

      message: "Server Error",
    });
  }
};

exports.driver_getPickupPointsByBus = async (req, res) => {
  try {
    const { busNumber } = req.params;
    const schoolId = req.schoolId;

    const page = req.query.page ? Number(req.query.page) : null;
    const limit = req.query.limit ? Number(req.query.limit) : null;

    const pickupDoc = await PickupPoint.findOne({
      schoolId,
      busNumber,
    }).lean();

    if (!pickupDoc) {
      return res.status(404).json({
        success: false,
        message: "Bus pickup points not found",
      });
    }

    const totalPickupPoints = pickupDoc.pickupPoints?.length || 0;

    const reversedPickupPoints = [...(pickupDoc.pickupPoints || [])].reverse();

    let pickupPoints = reversedPickupPoints;
    let pagination = null;

    if (page && limit) {
      const skip = (page - 1) * limit;

      pickupPoints = reversedPickupPoints.slice(skip, skip + limit);

      pagination = {
        currentPage: page,
        limit,
        totalPickupPoints,
        totalPages: Math.ceil(totalPickupPoints / limit),
      };
    }

    return res.status(200).json({
      success: true,
      message: "Pickup points fetched successfully",
      data: {
        busNumber: pickupDoc.busNumber,
        pickupPoints,
       radius: pickupDoc.radius
      },
      pagination,
    });
  } catch (error) {
    console.log(error);

    return res.status(500).json({
      success: false,
      message: "Server Error",
    });
  }
};
