const PickupPoint = require("../models/PickupPoint");
const User = require("../models/students");
const generateId = require("../utils/generateId");
const redisClient = require("../config/redis");
const { performance } = require("node:perf_hooks");

const clean = (value) => String(value || "").trim();
const cleanBus = (value) => clean(value).toUpperCase();
const redisKey = (schoolId, busNumber) =>
  `pickup_points:${schoolId}:${busNumber}`;

const escapeRegex = (value) =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const setPickupCache = async (schoolId, busNumber, pickupPoints) => {
  try {
    await redisClient.set(
      redisKey(schoolId, busNumber),
      JSON.stringify(pickupPoints || []),
    );
    return true;
  } catch (error) {
    console.error("Redis pickup cache error:", error);
    return false;
  }
};

const preparePickupPoints = (
  pickupPoints,
  { status, createdBy, lastModifiedBy },
) =>
  pickupPoints.map((point) => {
    const coordinates = point?.location?.coordinates;

    if (
      !clean(point?.name) ||
      !Array.isArray(coordinates) ||
      coordinates.length !== 2 ||
      !coordinates.every(Number.isFinite)
    ) {
      throw new Error("Invalid pickup point data");
    }

    return {
      pickupPointId: clean(point.pickupPointId) || `PP-${generateId()}`,
      name: clean(point.name),
      status,
      createdBy,
      lastModifiedBy,
      location: {
        type: "Point",
        coordinates,
      },
      radius: Number(point.radius) || 100,
      assignedStudents: Array.isArray(point.assignedStudents)
        ? point.assignedStudents
            .filter((student) => student?.parentId && student?.studentId)
            .map((student) => ({
              parentId: clean(student.parentId),
              childId: clean(student.childId),
              studentId: clean(student.studentId),
              busNumber: cleanBus(student.busNumber),
            }))
        : [],
    };
  });

/*
==================================================
CREATE PICKUP POINT - ADMIN
One atomic upsert instead of find + save/create
==================================================
*/
exports.createPickupPoint = async (req, res) => {
  try {
    const schoolId = clean(req.user?.schoolId);
    const busNumber = cleanBus(req.body?.busNumber);
    const pickupPoints = req.body?.pickupPoints;

    if (!schoolId || !busNumber) {
      return res.status(400).json({
        success: false,
        message: "schoolId and busNumber required",
      });
    }

    if (!Array.isArray(pickupPoints) || pickupPoints.length === 0) {
      return res.status(400).json({
        success: false,
        message: "pickupPoints array required",
      });
    }

    const prepared = preparePickupPoints(pickupPoints, {
      status: "PUBLISHED",
      createdBy: "ADMIN",
      lastModifiedBy: "Admin",
    });

    const updatedDoc = await PickupPoint.findOneAndUpdate(
      { schoolId, busNumber },
      {
        $setOnInsert: { schoolId, busNumber, radius: 150 },
        $push: { pickupPoints: { $each: prepared } },
      },
      {
        new: true,
        upsert: true,
        projection: {
          _id: 1,
          schoolId: 1,
          busNumber: 1,
          radius: 1,
          pickupPoints: 1,
        },
        lean: true,
      },
    );

    await setPickupCache(schoolId, busNumber, updatedDoc.pickupPoints);

    return res.status(200).json({
      success: true,
      message: "Pickup points added successfully",
      data: updatedDoc,
    });
  } catch (error) {
    console.error("createPickupPoint:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Server error",
    });
  }
};

/*
==================================================
UPDATE SINGLE PICKUP STATUS
One update + returned projection; no second find
==================================================
*/
exports.updateSinglePickupPointStatus = async (req, res) => {
  try {
    const schoolId = clean(req.user?.schoolId);
    const busNumber = cleanBus(req.body?.busNumber);
    const pickupPointId = clean(req.body?.pickupPointId);
    const status = clean(req.body?.status).toUpperCase();

    if (
      !schoolId ||
      !busNumber ||
      !pickupPointId ||
      !["DRAFT", "PUBLISHED"].includes(status)
    ) {
      return res.status(400).json({
        success: false,
        message: "Valid schoolId, busNumber, pickupPointId and status required",
      });
    }

    const updatedDoc = await PickupPoint.findOneAndUpdate(
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
      {
        new: true,
        projection: { _id: 0, pickupPoints: 1 },
        lean: true,
      },
    );

    if (!updatedDoc) {
      return res.status(404).json({
        success: false,
        message: "Route or pickup point not found",
      });
    }

    await setPickupCache(schoolId, busNumber, updatedDoc.pickupPoints);

    return res.status(200).json({
      success: true,
      message: "Pickup point status updated successfully",
    });
  } catch (error) {
    console.error("updateSinglePickupPointStatus:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Server error",
    });
  }
};

/*
==================================================
CREATE PICKUP POINT - DRIVER
One atomic upsert
==================================================
*/
exports.createPickupPointByDriver = async (req, res) => {
  try {
    const schoolId = clean(req.schoolId);
    const driverPhone = clean(req.driver?.phone);
    const busNumber = cleanBus(req.body?.busNumber);
    const pickupPoints = req.body?.pickupPoints;

    if (!schoolId || !driverPhone || !busNumber) {
      return res.status(400).json({
        success: false,
        message: "schoolId, driver phone and busNumber required",
      });
    }

    if (!Array.isArray(pickupPoints) || pickupPoints.length === 0) {
      return res.status(400).json({
        success: false,
        message: "pickupPoints array required",
      });
    }

    const prepared = preparePickupPoints(pickupPoints, {
      status: "DRAFT",
      createdBy: "DRIVER",
      lastModifiedBy: driverPhone,
    });

    const updatedDoc = await PickupPoint.findOneAndUpdate(
      { schoolId, busNumber },
      {
        $setOnInsert: { schoolId, busNumber, radius: 150 },
        $push: { pickupPoints: { $each: prepared } },
      },
      {
        new: true,
        upsert: true,
        projection: {
          _id: 1,
          schoolId: 1,
          busNumber: 1,
          radius: 1,
          pickupPoints: 1,
        },
        lean: true,
      },
    );

    await setPickupCache(schoolId, busNumber, updatedDoc.pickupPoints);

    return res.status(200).json({
      success: true,
      message: "Pickup points added successfully",
      data: updatedDoc,
    });
  } catch (error) {
    console.error("createPickupPointByDriver:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Server error",
    });
  }
};

/*
==================================================
ADD STUDENT
Two small concurrent validation reads instead of
multiple full-document sequential reads.
Then two targeted atomic writes.
==================================================
*/
exports.addStudent = async (req, res) => {
  try {
    const schoolId = clean(req.user?.schoolId);
    const busNumber = cleanBus(req.body?.busNumber);
    const pickupPointId = clean(req.body?.pickupPointId);
    const parentId = clean(req.body?.student?.parentId);
    const studentId = clean(req.body?.student?.studentId);

    if (!schoolId || !busNumber || !pickupPointId || !parentId || !studentId) {
      return res.status(400).json({
        success: false,
        code: "REQUIRED_FIELDS_MISSING",
        message:
          "schoolId, busNumber, pickupPointId, parentId and studentId are required",
      });
    }

    const [pickupState, parentDoc] = await Promise.all([
      PickupPoint.aggregate([
        {
          $match: {
            schoolId,
            $or: [
              { busNumber },
              {
                "pickupPoints.assignedStudents": {
                  $elemMatch: { parentId, studentId },
                },
              },
            ],
          },
        },
        {
          $project: {
            _id: 0,
            busNumber: 1,
            pickupPoints: {
              $filter: {
                input: { $ifNull: ["$pickupPoints", []] },
                as: "point",
                cond: {
                  $or: [
                    { $eq: ["$$point.pickupPointId", pickupPointId] },
                    {
                      $gt: [
                        {
                          $size: {
                            $filter: {
                              input: {
                                $ifNull: ["$$point.assignedStudents", []],
                              },
                              as: "assigned",
                              cond: {
                                $and: [
                                  { $eq: ["$$assigned.parentId", parentId] },
                                  { $eq: ["$$assigned.studentId", studentId] },
                                ],
                              },
                            },
                          },
                        },
                        0,
                      ],
                    },
                  ],
                },
              },
            },
          },
        },
      ]),
      User.findOne(
        {
          schoolId,
          parentId,
          "status.active": true,
          children: {
            $elemMatch: {
              studentId,
              "status.active": true,
            },
          },
        },
        {
          _id: 0,
          parentId: 1,
          children: {
            $elemMatch: {
              studentId,
              "status.active": true,
            },
          },
        },
      ).lean(),
    ]);

    const targetBus = pickupState.find((doc) => doc.busNumber === busNumber);
    const targetPoint = targetBus?.pickupPoints?.find(
      (point) => point.pickupPointId === pickupPointId,
    );

    if (!targetPoint) {
      return res.status(404).json({
        success: false,
        code: "PICKUP_POINT_NOT_FOUND",
        message: "The selected pickup point does not exist on the selected bus",
      });
    }

    if (!parentDoc?.children?.[0]) {
      return res.status(404).json({
        success: false,
        code: "ACTIVE_PARENT_OR_STUDENT_NOT_FOUND",
        message: "Active parent or active student was not found",
      });
    }

    const child = parentDoc.children[0];
    const conflictDoc = pickupState.find((doc) =>
      doc.pickupPoints?.some((point) =>
        point.assignedStudents?.some(
          (assigned) =>
            assigned.parentId === parentId &&
            assigned.studentId === studentId,
        ),
      ),
    );

    const conflictPoint = conflictDoc?.pickupPoints?.find((point) =>
      point.assignedStudents?.some(
        (assigned) =>
          assigned.parentId === parentId &&
          assigned.studentId === studentId,
      ),
    );

    if (conflictDoc && conflictPoint) {
      const sameBus = conflictDoc.busNumber === busNumber;
      const samePoint = conflictPoint.pickupPointId === pickupPointId;

      return res.status(409).json({
        success: false,
        code: sameBus
          ? samePoint
            ? "STUDENT_ALREADY_ASSIGNED_SAME_POINT"
            : "STUDENT_ASSIGNED_OTHER_POINT_SAME_BUS"
          : "STUDENT_ASSIGNED_OTHER_BUS",
        conflictType: sameBus
          ? samePoint
            ? "SAME_BUS_SAME_PICKUP_POINT"
            : "SAME_BUS_DIFFERENT_PICKUP_POINT"
          : "DIFFERENT_BUS",
        message: sameBus
          ? samePoint
            ? "This student is already assigned to this pickup point"
            : "This student is already assigned to another pickup point on the same bus"
          : "This student is already assigned to another bus and pickup point",
        existingAssignment: {
          schoolId,
          parentId,
          studentId,
          busNumber: conflictDoc.busNumber,
          pickupPointId: conflictPoint.pickupPointId,
          pickupPointName: conflictPoint.name || null,
        },
      });
    }

    const existingChildBus = cleanBus(child.busNumber);
    const existingChildPoint = clean(child.pickupPointId);

    if (existingChildBus || existingChildPoint) {
      return res.status(409).json({
        success: false,
        code: "CHILD_RECORD_HAS_OTHER_ASSIGNMENT",
        message:
          "The child record already contains a bus or pickup point assignment",
        existingAssignment: {
          schoolId,
          parentId,
          studentId,
          busNumber: existingChildBus || null,
          pickupPointId: existingChildPoint || null,
          source: "CHILD_RECORD",
        },
      });
    }

    const userUpdate = await User.updateOne(
      {
        schoolId,
        parentId,
        "status.active": true,
        children: {
          $elemMatch: {
            studentId,
            "status.active": true,
            $and: [
              {
                $or: [
                  { busNumber: { $exists: false } },
                  { busNumber: "" },
                  { busNumber: null },
                ],
              },
              {
                $or: [
                  { pickupPointId: { $exists: false } },
                  { pickupPointId: "" },
                  { pickupPointId: null },
                ],
              },
            ],
          },
        },
      },
      {
        $set: {
          "children.$.busNumber": busNumber,
          "children.$.pickupPointId": pickupPointId,
        },
      },
    );

    if (userUpdate.modifiedCount === 0) {
      return res.status(409).json({
        success: false,
        code: "STUDENT_ASSIGNMENT_CHANGED",
        message: "Student assignment changed during this request",
      });
    }

    const updatedPickup = await PickupPoint.findOneAndUpdate(
      {
        schoolId,
        busNumber,
        pickupPoints: {
          $elemMatch: {
            pickupPointId,
            assignedStudents: {
              $not: {
                $elemMatch: { parentId, studentId },
              },
            },
          },
        },
      },
      {
        $push: {
          "pickupPoints.$.assignedStudents": {
            parentId,
            studentId,
            busNumber,
          },
        },
      },
      {
        new: true,
        projection: { _id: 0, pickupPoints: 1 },
        lean: true,
      },
    );

    if (!updatedPickup) {
      await User.updateOne(
        { schoolId, parentId, "children.studentId": studentId },
        {
          $set: {
            "children.$.busNumber": "",
            "children.$.pickupPointId": "",
          },
        },
      );

      return res.status(409).json({
        success: false,
        code: "PICKUP_ASSIGNMENT_CHANGED",
        message: "Pickup assignment changed during this request",
      });
    }

    await setPickupCache(schoolId, busNumber, updatedPickup.pickupPoints);

    return res.status(200).json({
      success: true,
      code: "STUDENT_ASSIGNED_SUCCESSFULLY",
      message: "Student assigned to pickup point successfully",
      assignment: {
        schoolId,
        parentId,
        studentId,
        busNumber,
        pickupPointId,
        pickupPointName: targetPoint.name || null,
      },
    });
  } catch (error) {
    console.error("addStudent:", error);
    return res.status(500).json({
      success: false,
      code: "ADD_STUDENT_SERVER_ERROR",
      message: "Server error while assigning student",
      error: error.message,
    });
  }
};

/*
==================================================
REMOVE STUDENT
No preliminary full-document read.
Two targeted writes; returned pickup projection
is reused for Redis and response.
==================================================
*/
exports.removeStudent = async (req, res) => {
  try {
    const schoolId = clean(req.user?.schoolId);
    const busNumber = cleanBus(req.body?.busNumber);
    const pickupPointId = clean(req.body?.pickupPointId);
    const parentId = clean(req.body?.parentId);
    const studentId = clean(req.body?.studentId);

    if (!schoolId || !busNumber || !pickupPointId || !parentId || !studentId) {
      return res.status(400).json({
        success: false,
        code: "REQUIRED_FIELDS_MISSING",
        message:
          "School ID, bus number, pickup point ID, parent ID and student ID are required",
      });
    }

    const updatedPickup = await PickupPoint.findOneAndUpdate(
      {
        schoolId,
        busNumber,
        pickupPoints: {
          $elemMatch: {
            pickupPointId,
            assignedStudents: {
              $elemMatch: { parentId, studentId },
            },
          },
        },
      },
      {
        $pull: {
          "pickupPoints.$[point].assignedStudents": {
            parentId,
            studentId,
          },
        },
      },
      {
        arrayFilters: [{ "point.pickupPointId": pickupPointId }],
        new: true,
        projection: {
          _id: 0,
          busNumber: 1,
          radius: 1,
          pickupPoints: 1,
        },
        lean: true,
      },
    );

    if (!updatedPickup) {
      return res.status(404).json({
        success: false,
        code: "STUDENT_ASSIGNMENT_NOT_FOUND",
        message: "Student is not assigned to this pickup point",
      });
    }

    const userUpdate = await User.updateOne(
      {
        schoolId,
        parentId,
        children: {
          $elemMatch: {
            studentId,
            busNumber,
            pickupPointId,
          },
        },
      },
      {
        $set: {
          "children.$.busNumber": "",
          "children.$.pickupPointId": "",
        },
      },
    );

    const redisSynced = await setPickupCache(
      schoolId,
      busNumber,
      updatedPickup.pickupPoints,
    );

    return res.status(200).json({
      success: true,
      code: "STUDENT_REMOVED_SUCCESSFULLY",
      message:
        "Student removed from pickup point and user assignment cleared successfully",
      removedAssignment: {
        schoolId,
        busNumber,
        pickupPointId,
        parentId,
        studentId,
      },
      databaseUpdate: {
        pickupPointModified: true,
        userAssignmentCleared: userUpdate.modifiedCount > 0,
      },
      redisSync: {
        success: redisSynced,
      },
      data: updatedPickup,
    });
  } catch (error) {
    console.error("removeStudent:", error);
    return res.status(500).json({
      success: false,
      code: "REMOVE_STUDENT_SERVER_ERROR",
      message: "Server error while removing student from pickup point",
      error:
        process.env.NODE_ENV === "development"
          ? error.message
          : undefined,
    });
  }
};

/*
==================================================
REMOVE PICKUP POINT
One findOneAndUpdate and projected return
==================================================
*/
exports.removePickupPoint = async (req, res) => {
  try {
    const schoolId = clean(req.user?.schoolId);
    const busNumber = cleanBus(req.body?.busNumber);
    const pickupPointId = clean(req.body?.pickupPointId);

    if (!schoolId || !busNumber || !pickupPointId) {
      return res.status(400).json({
        success: false,
        message: "schoolId, busNumber and pickupPointId required",
      });
    }

    const updatedDoc = await PickupPoint.findOneAndUpdate(
      {
        schoolId,
        busNumber,
        "pickupPoints.pickupPointId": pickupPointId,
      },
      {
        $pull: { pickupPoints: { pickupPointId } },
      },
      {
        new: true,
        projection: {
          _id: 1,
          schoolId: 1,
          busNumber: 1,
          radius: 1,
          pickupPoints: 1,
        },
        lean: true,
      },
    );

    if (!updatedDoc) {
      return res.status(404).json({
        success: false,
        message: "Pickup point not found",
      });
    }

    await setPickupCache(schoolId, busNumber, updatedDoc.pickupPoints);

    return res.status(200).json({
      success: true,
      message: "Pickup point removed successfully",
      data: updatedDoc,
    });
  } catch (error) {
    console.error("removePickupPoint:", error);
    return res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};

/*
==================================================
ADD ADDITIONAL PICKUP POINT
Atomic duplicate-safe push; no initial full read
==================================================
*/
exports.addPickupPoint = async (req, res) => {
  try {
    const schoolId = clean(req.user?.schoolId);
    const busNumber = cleanBus(req.body?.busNumber);
    const pickupPoints = req.body?.pickupPoints;

    if (!schoolId || !busNumber) {
      return res.status(400).json({
        success: false,
        message: "schoolId and busNumber required",
      });
    }

    if (!Array.isArray(pickupPoints) || pickupPoints.length === 0) {
      return res.status(400).json({
        success: false,
        message: "pickupPoints array required",
      });
    }

    const prepared = preparePickupPoints(pickupPoints, {
      status: "PUBLISHED",
      createdBy: "ADMIN",
      lastModifiedBy: "Admin",
    });

    const requestedIds = prepared.map((point) => point.pickupPointId);

    const updatedDoc = await PickupPoint.findOneAndUpdate(
      {
        schoolId,
        busNumber,
        "pickupPoints.pickupPointId": { $nin: requestedIds },
      },
      {
        $push: { pickupPoints: { $each: prepared } },
      },
      {
        new: true,
        projection: {
          _id: 1,
          busNumber: 1,
          radius: 1,
          pickupPoints: 1,
        },
        lean: true,
      },
    );

    if (!updatedDoc) {
      const exists = await PickupPoint.exists({ schoolId, busNumber });

      return res.status(exists ? 409 : 404).json({
        success: false,
        message: exists
          ? "One or more pickup points already exist"
          : "Pickup document not found",
      });
    }

    await setPickupCache(schoolId, busNumber, updatedDoc.pickupPoints);

    return res.status(200).json({
      success: true,
      message: "Pickup points added successfully",
      data: updatedDoc,
    });
  } catch (error) {
    console.error("addPickupPoint:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Server error",
    });
  }
};

/*
==================================================
EDIT PICKUP POINT
Direct positional update; no read-modify-save
==================================================
*/
exports.editPickupPoint = async (req, res) => {
  try {
    const schoolId = clean(req.user?.schoolId);
    const busNumber = cleanBus(req.body?.busNumber);
    const pickupPointId = clean(req.body?.pickupPointId);

    if (!schoolId || !busNumber || !pickupPointId) {
      return res.status(400).json({
        success: false,
        message: "schoolId, busNumber and pickupPointId required",
      });
    }

    const set = {};

    if (req.body.name !== undefined) {
      set["pickupPoints.$.name"] = clean(req.body.name);
    }

    if (req.body.radius !== undefined) {
      set["pickupPoints.$.radius"] = Number(req.body.radius);
    }

    if (req.body.location !== undefined) {
      const coordinates = req.body.location?.coordinates;

      if (
        !Array.isArray(coordinates) ||
        coordinates.length !== 2 ||
        !coordinates.every(Number.isFinite)
      ) {
        return res.status(400).json({
          success: false,
          message: "Valid location coordinates [lng, lat] required",
        });
      }

      set["pickupPoints.$.location"] = {
        type: "Point",
        coordinates,
      };
    }

    if (Object.keys(set).length === 0) {
      return res.status(400).json({
        success: false,
        message: "No editable values supplied",
      });
    }

    const updatedDoc = await PickupPoint.findOneAndUpdate(
      {
        schoolId,
        busNumber,
        "pickupPoints.pickupPointId": pickupPointId,
      },
      { $set: set },
      {
        new: true,
        projection: {
          _id: 1,
          busNumber: 1,
          radius: 1,
          pickupPoints: 1,
        },
        lean: true,
      },
    );

    if (!updatedDoc) {
      return res.status(404).json({
        success: false,
        message: "Pickup point not found",
      });
    }

    await setPickupCache(schoolId, busNumber, updatedDoc.pickupPoints);

    return res.status(200).json({
      success: true,
      message: "Pickup point updated successfully",
      data: updatedDoc,
    });
  } catch (error) {
    console.error("editPickupPoint:", error);
    return res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};

/*
==================================================
CHANGE BUS NUMBER
No pre-read or duplicate lookup.
Unique index handles duplicate bus number.
Pipeline also updates nested student busNumber.
==================================================
*/
exports.changeBusId = async (req, res) => {
  try {
    const schoolId = clean(req.user?.schoolId);
    const oldBusNumber = cleanBus(req.body?.oldBusNumber);
    const newBusNumber = cleanBus(req.body?.newBusNumber);

    if (!schoolId || !oldBusNumber || !newBusNumber) {
      return res.status(400).json({
        success: false,
        message: "Old and new bus numbers are required",
      });
    }

    const updatedDoc = await PickupPoint.findOneAndUpdate(
      {
        schoolId,
        busNumber: oldBusNumber,
      },
      [
        {
          $set: {
            busNumber: newBusNumber,
            pickupPoints: {
              $map: {
                input: { $ifNull: ["$pickupPoints", []] },
                as: "point",
                in: {
                  $mergeObjects: [
                    "$$point",
                    {
                      assignedStudents: {
                        $map: {
                          input: {
                            $ifNull: ["$$point.assignedStudents", []],
                          },
                          as: "assigned",
                          in: {
                            $mergeObjects: [
                              "$$assigned",
                              { busNumber: newBusNumber },
                            ],
                          },
                        },
                      },
                    },
                  ],
                },
              },
            },
          },
        },
      ],
      {
        new: true,
        projection: {
          _id: 1,
          schoolId: 1,
          busNumber: 1,
          radius: 1,
          pickupPoints: 1,
        },
        lean: true,
      },
    );

    if (!updatedDoc) {
      return res.status(404).json({
        success: false,
        message: "Pickup document not found",
      });
    }

    await Promise.all([
      redisClient.del(redisKey(schoolId, oldBusNumber)),
      setPickupCache(schoolId, newBusNumber, updatedDoc.pickupPoints),
    ]);

    return res.status(200).json({
      success: true,
      message: "Bus ID updated successfully",
      data: updatedDoc,
    });
  } catch (error) {
    if (error?.code === 11000) {
      return res.status(409).json({
        success: false,
        message: "New bus number already exists",
      });
    }

    console.error("changeBusId:", error);
    return res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};

/*
==================================================
REMOVE COMPLETE BUS PICKUP DOCUMENT
One findOneAndDelete only
==================================================
*/
exports.removeCompleteBusPickupPoints = async (req, res) => {
  try {
    const schoolId = clean(req.user?.schoolId);
    const busNumber = cleanBus(req.body?.busNumber);

    if (!schoolId || !busNumber) {
      return res.status(400).json({
        success: false,
        message: "Bus number is required",
      });
    }

    const deleted = await PickupPoint.findOneAndDelete(
      { schoolId, busNumber },
      { projection: { _id: 1 } },
    ).lean();

    if (!deleted) {
      return res.status(404).json({
        success: false,
        message: "Pickup document not found",
      });
    }

    await redisClient.del(redisKey(schoolId, busNumber));

    return res.status(200).json({
      success: true,
      message: "Complete bus pickup points removed successfully",
    });
  } catch (error) {
    console.error("removeCompleteBusPickupPoints:", error);
    return res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};

/*
==================================================
GET PAGINATED BUSES
One aggregation with $facet instead of
countDocuments + find.
Pickup slicing happens inside MongoDB.
==================================================
*/
exports.getPaginatedBusesWithPickupPoints = async (req, res) => {
  try {
    const schoolId = clean(req.user?.schoolId);
    console.log(schoolId);
    const page = Math.max(Number(req.query.page) || 1, 1);
    const limit = Math.min(
      Math.max(Number(req.query.limit) || 5, 1),
      100,
    );
    const pickupPointLimit = Math.min(
      Math.max(Number(req.query.pickupPointLimit) || 5, 1),
      100,
    );
    const search = cleanBus(req.query.search);
    const skip = (page - 1) * limit;

    const match = { schoolId };

    if (search) {
      match.busNumber = {
        $regex: `^${escapeRegex(search)}`,
      };
    }

    const [result] = await PickupPoint.aggregate([
      { $match: match },
      {
        $facet: {
          metadata: [{ $count: "totalBuses" }],
          data: [
            { $sort: { createdAt: -1, _id: -1 } },
            { $skip: skip },
            { $limit: limit },
            {
              $project: {
                _id: 1,
                busNumber: 1,
                createdAt: 1,
                totalPickupPoints: {
                  $size: { $ifNull: ["$pickupPoints", []] },
                },
                pickupPoints: {
                  $slice: [
                    { $ifNull: ["$pickupPoints", []] },
                    pickupPointLimit,
                  ],
                },
              },
            },
          ],
        },
      },
      {
        $project: {
          totalBuses: {
            $ifNull: [
              { $arrayElemAt: ["$metadata.totalBuses", 0] },
              0,
            ],
          },
          data: 1,
        },
      },
    ]).option({ maxTimeMS: 3000 });
console.log(result,"getPickup point with bus");
    const totalBuses = result?.totalBuses || 0;
    const data = (result?.data || []).map((bus) => ({
      ...bus,
      pickupPointPagination: {
        currentPage: 1,
        limit: pickupPointLimit,
        totalPickupPoints: bus.totalPickupPoints,
        totalPages: Math.ceil(
          bus.totalPickupPoints / pickupPointLimit,
        ),
      },
    }));

    return res.status(200).json({
      success: true,
      message: "Buses fetched successfully",
      data,
      pagination: {
        currentPage: page,
        limit,
        totalBuses,
        totalPages: Math.ceil(totalBuses / limit),
      },
    });
  } catch (error) {
    console.error("getPaginatedBusesWithPickupPoints:", error);
    return res.status(500).json({
      success: false,
      message: "Server Error",
    });
  }
};

/*
==================================================
GET PICKUP POINT BY ID
MongoDB extracts only matching embedded point
==================================================
*/
exports.getPickupPointById = async (req, res) => {
  try {
    const schoolId = clean(req.user?.schoolId);
    const pickupPointId = clean(req.params?.id);

    const [result] = await PickupPoint.aggregate([
      {
        $match: {
          schoolId,
          "pickupPoints.pickupPointId": pickupPointId,
        },
      },
      {
        $project: {
          _id: 0,
          pickupPoint: {
            $arrayElemAt: [
              {
                $filter: {
                  input: "$pickupPoints",
                  as: "point",
                  cond: {
                    $eq: [
                      "$$point.pickupPointId",
                      pickupPointId,
                    ],
                  },
                },
              },
              0,
            ],
          },
        },
      },
    ]).option({ maxTimeMS: 2000 });

    if (!result?.pickupPoint) {
      return res.status(404).json({
        success: false,
        message: "Pickup point not found",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Pickup point fetched successfully",
      data: result.pickupPoint,
    });
  } catch (error) {
    console.error("getPickupPointById:", error);
    return res.status(500).json({
      success: false,
      message: "Server Error",
    });
  }
};

/*
==================================================
ADMIN GET PICKUP POINTS BY BUS
MongoDB reverses and slices embedded array.
Only requested page crosses the network.
==================================================
*/
exports.admin_getPickupPointsByBus = async (req, res) => {
  try {
    const schoolId = clean(req.user?.schoolId);
    const busNumber = cleanBus(req.params?.busNumber);
    const page = Math.max(Number(req.query.page) || 1, 1);
    const limit = Math.min(
      Math.max(Number(req.query.limit) || 5, 1),
      100,
    );
    const skip = (page - 1) * limit;

    const [result] = await PickupPoint.aggregate([
      {
        $match: {
          schoolId,
          busNumber,
        },
      },
      {
        $project: {
          _id: 0,
          busNumber: 1,
          totalPickupPoints: {
            $size: { $ifNull: ["$pickupPoints", []] },
          },
          pickupPoints: {
            $slice: [
              {
                $reverseArray: {
                  $ifNull: ["$pickupPoints", []],
                },
              },
              skip,
              limit,
            ],
          },
        },
      },
    ]).option({ maxTimeMS: 2000 });

    if (!result) {
      return res.status(404).json({
        success: false,
        message: "Bus pickup points not found",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Pickup points fetched successfully",
      data: {
        busNumber: result.busNumber,
        pickupPoints: result.pickupPoints,
      },
      pagination: {
        currentPage: page,
        limit,
        totalPickupPoints: result.totalPickupPoints,
        totalPages: Math.ceil(
          result.totalPickupPoints / limit,
        ),
      },
    });
  } catch (error) {
    console.error("admin_getPickupPointsByBus:", error);
    return res.status(500).json({
      success: false,
      message: "Server Error",
    });
  }
};

/*
==================================================
DRIVER GET PICKUP POINTS WITH ASSIGNED FAMILIES
One aggregation round trip.
==================================================
*/
exports.driver_getPickupPointsByBus = async (req, res) => {
  const apiStart = performance.now();

  try {
    const schoolId = clean(req.schoolId);
    const busNumber = cleanBus(req.params?.busNumber);

    if (!schoolId || !busNumber) {
      return res.status(400).json({
        success: false,
        message: "School ID and bus number are required",
      });
    }

    const dbStart = performance.now();

    const [result] = await PickupPoint.aggregate([
      {
        $match: {
          schoolId,
          busNumber,
        },
      },
      {
        $project: {
          _id: 0,
          schoolId: 1,
          busNumber: 1,
          radius: 1,
          pickupPoints: {
            $reverseArray: {
              $ifNull: ["$pickupPoints", []],
            },
          },
        },
      },
      {
        $unwind: {
          path: "$pickupPoints",
          preserveNullAndEmptyArrays: true,
        },
      },
      {
        $lookup: {
          from: User.collection.name,
          let: {
            pickupSchoolId: "$schoolId",
            assignedStudents: {
              $ifNull: [
                "$pickupPoints.assignedStudents",
                [],
              ],
            },
            assignedParentIds: {
              $map: {
                input: {
                  $ifNull: [
                    "$pickupPoints.assignedStudents",
                    [],
                  ],
                },
                as: "assigned",
                in: "$$assigned.parentId",
              },
            },
          },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    {
                      $eq: [
                        "$schoolId",
                        "$$pickupSchoolId",
                      ],
                    },
                    {
                      $eq: ["$status.active", true],
                    },
                    {
                      $in: [
                        "$parentId",
                        "$$assignedParentIds",
                      ],
                    },
                  ],
                },
              },
            },
            {
              $project: {
                _id: 0,
                parentId: 1,
                parent: {
                  name: {
                    $ifNull: ["$parent.name", ""],
                  },
                  phone: {
                    $ifNull: ["$parent.phone", ""],
                  },
                },
                children: {
                  $map: {
                    input: {
                      $filter: {
                        input: {
                          $ifNull: ["$children", []],
                        },
                        as: "child",
                        cond: {
                          $and: [
                            {
                              $eq: [
                                "$$child.status.active",
                                true,
                              ],
                            },
                            {
                              $gt: [
                                {
                                  $size: {
                                    $filter: {
                                      input:
                                        "$$assignedStudents",
                                      as: "assigned",
                                      cond: {
                                        $and: [
                                          {
                                            $eq: [
                                              "$$assigned.parentId",
                                              "$parentId",
                                            ],
                                          },
                                          {
                                            $eq: [
                                              "$$assigned.studentId",
                                              "$$child.studentId",
                                            ],
                                          },
                                        ],
                                      },
                                    },
                                  },
                                },
                                0,
                              ],
                            },
                          ],
                        },
                      },
                    },
                    as: "child",
                    in: {
                      studentId: "$$child.studentId",
                      name: {
                        $ifNull: ["$$child.name", ""],
                      },
                      class: {
                        $ifNull: ["$$child.class", ""],
                      },
                      section: {
                        $ifNull: ["$$child.section", ""],
                      },
                      rollNumber: {
                        $ifNull: [
                          "$$child.rollNumber",
                          "",
                        ],
                      },
                    },
                  },
                },
              },
            },
            {
              $match: {
                "children.0": { $exists: true },
              },
            },
          ],
          as: "assignedParentDetails",
        },
      },
      {
        $set: {
          "pickupPoints.assignedStudents":
            "$assignedParentDetails",
        },
      },
      {
        $unset: [
          "assignedParentDetails",
          "pickupPoints._id",
          "pickupPoints.assignedStudents._id",
        ],
      },
      {
        $group: {
          _id: null,
          busNumber: { $first: "$busNumber" },
          radius: { $first: "$radius" },
          pickupPoints: { $push: "$pickupPoints" },
        },
      },
      {
        $project: {
          _id: 0,
          busNumber: 1,
          radius: 1,
          pickupPoints: {
            $filter: {
              input: "$pickupPoints",
              as: "point",
              cond: { $ne: ["$$point", null] },
            },
          },
        },
      },
    ]).option({ maxTimeMS: 3000 });

    const dbTime = performance.now() - dbStart;

    if (!result) {
      return res.status(404).json({
        success: false,
        message: "Bus pickup points not found",
      });
    }

    const apiTime = performance.now() - apiStart;

    res.setHeader(
      "X-Database-Time",
      `${dbTime.toFixed(2)}ms`,
    );
    res.setHeader(
      "X-API-Time",
      `${apiTime.toFixed(2)}ms`,
    );

    return res.status(200).json({
      success: true,
      message: "Pickup points fetched successfully",
      data: result,
    });
  } catch (error) {
    console.error("driver_getPickupPointsByBus:", error);
    return res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};