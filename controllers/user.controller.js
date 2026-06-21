const generateId = require("../utils/generateId");
const mongoose = require("mongoose");
const User = require("../models/students");
const School = require("../models/School");

/*
================================================================================
1. SEND REGISTER OTP
================================================================================
*/

exports.sendRegisterOTP = async (req, res) => {

  try {

    const {
      
      parentPhone,
    } = req.body;
   const { schoolId } = req.user;
    /*
    =====================================
    VALIDATION
    =====================================
    */

    if (
      !schoolId ||
      !parentPhone
    ) {

      return res.status(400).json({

        success: false,

        message:
          "schoolId and parentPhone are required",
      });
    }

    /*
    =====================================
    CHECK SCHOOL
    =====================================
    */

    const school =
      await School.findOne({
        schoolId,
      });

    if (!school) {

      return res.status(404).json({

        success: false,

        message:
          "School not found",
      });
    }

    /*
    =====================================
    GENERATE OTP
    =====================================
    */

    const otp =
      Math.floor(
        100000 +
        Math.random() * 900000
      ).toString();

    /*
    =====================================
    FIND OR CREATE TEMP USER
    =====================================
    */

    let user =
      await User.findOne({

        schoolId,

        "parent.phone":
          parentPhone,
      });

    if (!user) {

      user = new User({

        parentId:
          generateId("PAR"),

        schoolId,

        parent: {

          name: "TEMP",

          phone:
            parentPhone,
        },

        children: [],
      });
    }

    /*
    =====================================
    SAVE OTP
    =====================================
    */

    user.otp = {

      code: otp,

      expiresAt:
        new Date(
          Date.now() +
          10 * 60 * 1000
        ),

      attempts: 0,
    };

    await user.save();

    console.log(
      `Register OTP for ${parentPhone}: ${otp}`
    );

    return res.status(200).json({

      success: true,

      message:
        "OTP sent successfully",

      data: {
        otp,
      },
    });

  } catch (err) {

    return res.status(500).json({

      success: false,

      error:
        err.message,
    });
  }
};

/*
================================================================================
2. VERIFY REGISTER OTP
================================================================================
*/

exports.verifyRegisterOTP = async (req, res) => {

  try {

    const {
      
      parentPhone,
      otp,
    } = req.body;
   const { schoolId } = req.user;
    if (
      !schoolId ||
      !parentPhone ||
      !otp
    ) {

      return res.status(400).json({

        success: false,

        message:
          "schoolId, parentPhone and otp required",
      });
    }

    const user =
      await User.findOne({

        schoolId,

        "parent.phone":
          parentPhone,
      });

    if (!user) {

      return res.status(404).json({

        success: false,

        message:
          "User not found",
      });
    }

    if (
      !user.otp ||
      user.otp.code !== otp
    ) {

      return res.status(401).json({

        success: false,

        message:
          "Invalid OTP",
      });
    }

    if (
      user.otp.expiresAt <
      new Date()
    ) {

      return res.status(400).json({

        success: false,

        message:
          "OTP expired",
      });
    }

    /*
    =====================================
    CLEAR OTP
    =====================================
    */

    user.otp = undefined;

    await user.save();

    return res.status(200).json({

      success: true,

      verified: true,

      message:
        "OTP verified successfully",
    });

  } catch (err) {

    return res.status(500).json({

      success: false,

      error:
        err.message,
    });
  }
};

/*
================================================================================
3. CREATE STUDENT
================================================================================
*/

exports.createStudent = async (req, res) => {
  try {
    const { parent, child, busNumber, pickupPointId } = req.body;
    const { schoolId } = req.user;

    /*
    =====================================
    VALIDATION
    =====================================
    */
    console.log("School ID:", schoolId);
    const missingFields = [];

    if (!schoolId) missingFields.push("schoolId");
    if (!parent?.name) missingFields.push("parent.name");
    if (!parent?.phone) missingFields.push("parent.phone");
    if (!busNumber) missingFields.push("busNumber");

    // Ensure child exists and is an array with at least one element
    if (!child || !Array.isArray(child) || child.length === 0) {
      missingFields.push("child array (must contain at least one student)");
    } else {
      // Validate every child entity inside the incoming array
      child.forEach((c, index) => {
        if (!c.studentId) missingFields.push(`child[${index}].studentId`);
        if (!c.name) missingFields.push(`child[${index}].name`);
        if (!c.class) missingFields.push(`child[${index}].class`);
        if (!c.section) missingFields.push(`child[${index}].section`);
        if (!c.rollNumber) missingFields.push(`child[${index}].rollNumber`);
      });
    }

    if (missingFields.length > 0) {
      return res.status(400).json({
        success: false,
        message: "Required fields missing",
        missingFields,
      });
    }

    /*
    =====================================
    FIND EXISTING PARENT
    =====================================
    */
    let existingParent = await User.findOne({
      schoolId,
      "parent.phone": parent.phone,
    });

    /*
    =====================================
    MAP MULTIPLE CHILDREN DATA
    =====================================
    */
    const childrenDataArray = child.map((c) => ({
      childId: generateId("CHI"),
      studentId: c.studentId,
      name: c.name,
      class: c.class,
      section: c.section,
      rollNumber: c.rollNumber,
      busNumber,
      pickupPointId: pickupPointId || null,
      status: {
        active: true,
      },
    }));

    /*
    =====================================
    EXISTING PARENT MANAGEMENT WORKFLOW
    =====================================
    */
    if (existingParent) {
      const duplicateStudentIds = [];
      
      // Look for overlaps within existing storage profiles
      childrenDataArray.forEach((newChild) => {
        const alreadyChild = existingParent.children.some(
          (c) => c.studentId === newChild.studentId
        );
        if (alreadyChild) {
          duplicateStudentIds.push(newChild.studentId);
        }
      });

      if (duplicateStudentIds.length > 0) {
        return res.status(409).json({
          success: false,
          message: "One or more student records already exist under this parent profile setup.",
          duplicateStudentIds,
        });
      }

      // Update name metrics if changed, and push all children entries safely
      existingParent.parent.name = parent.name;
      existingParent.children.push(...childrenDataArray);

      await existingParent.save();

      return res.status(200).json({
        success: true,
        message: "Supplemental child profiles attached to parent account registry records successfully.",
        data: existingParent,
      });
    }

    /*
    =====================================
    CREATE NEW PARENT WITH ALL CHILDREN
    =====================================
    */
    const newParent = await User.create({
      parentId: generateId("PAR"),
      schoolId,
      parent: {
        name: parent.name,
        phone: parent.phone,
      },
      children: childrenDataArray, // Assigns the entire pre-mapped child configuration matrix
      status: {
        active: true,
      },
    });

    return res.status(201).json({
      success: true,
      message: "Parent profile database matrix and corresponding child structures synchronized.",
      data: newParent,
    });

  } catch (err) {
    return res.status(500).json({
      success: false,
      error: err.message,
    });
  }
};
exports.addChild = async (req, res) => {
  try {
    const { parentId } = req.params;
  const { schoolId } = req.user;
    // Validate parentId exists
    if (!parentId ||parentId==="undefined") {
      return res.status(400).json({
        success: false,
        message: "Parent ID is required",
      });
    }

    const {
      
      studentId,
      name,
      class: studentClass,
      section,
      rollNumber,
      busNumber,
      pickupPointId,
    } = req.body;

    const missingFields = [];

  

    if (!studentId)
      missingFields.push("studentId");

    if (!name)
      missingFields.push("name");

    if (!studentClass)
      missingFields.push("class");

    if (!section)
      missingFields.push("section");

    if (!rollNumber)
      missingFields.push("rollNumber");

    if (!busNumber)
      missingFields.push("busNumber");

    if (!pickupPointId)
      missingFields.push(
        "pickupPointId"
      );

    if (missingFields.length) {
      return res.status(400).json({
        success: false,
        message:
          "Required fields missing",
        missingFields,
      });
    }

    const user =
      await User.findOne({ parentId,schoolId });

    if (!user) {
      return res.status(404).json({
        success: false,
        message:
          "Parent not found",
      });
    }
const childId= generateId("CHI"); 
    user.children.push({
      childId,
      studentId,
      name,
      class: studentClass,
      section,
      rollNumber,
      busNumber,
      pickupPointId,
      status: {
        active: true,
      },
    });

    await user.save();

    return res.status(200).json({
      success: true,
      message:
        "Child added successfully",
      data: user,
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
================================================================================
4. SEND LOGIN OTP
================================================================================
*/

exports.sendOTP = async (req, res) => {

  try {

    const {
      
      parentPhone,
    } = req.body;
   const { schoolId } = req.user;

    if (
      !schoolId ||
      !parentPhone
    ) {

      return res.status(400).json({

        success: false,

        message:
          "schoolId and parentPhone required",
      });
    }

    const user =
      await User.findOne({

        schoolId,

        "parent.phone":
          parentPhone,
      });

    if (!user) {

      return res.status(404).json({

        success: false,

        message:
          "User not found",
      });
    }

    const otp =
      Math.floor(
        100000 +
        Math.random() * 900000
      ).toString();

    user.otp = {

      code: otp,

      expiresAt:
        new Date(
          Date.now() +
          10 * 60 * 1000
        ),

      attempts: 0,
    };

    await user.save();

    console.log(
      `Login OTP for ${parentPhone}: ${otp}`
    );

    return res.status(200).json({

      success: true,

      message:
        "OTP sent successfully",

      data: {
        otp,
      },
    });

  } catch (err) {

    return res.status(500).json({

      success: false,

      error:
        err.message,
    });
  }
};

/*
================================================================================
5. VERIFY LOGIN OTP
================================================================================
*/

exports.verifyOTP = async (req, res) => {

  try {

    const {
      
      parentPhone,
      otp,
    } = req.body;
   const { schoolId } = req.user;

    const user =
      await User.findOne({

        schoolId,

        "parent.phone":
          parentPhone,
      });

    if (!user) {

      return res.status(404).json({

        success: false,

        message:
          "User not found",
      });
    }

    if (
      !user.otp ||
      user.otp.code !== otp
    ) {

      return res.status(401).json({

        success: false,

        message:
          "Invalid OTP",
      });
    }

    if (
      user.otp.expiresAt <
      new Date()
    ) {

      return res.status(400).json({

        success: false,

        message:
          "OTP expired",
      });
    }

    /*
    =====================================
    CLEAR OTP
    =====================================
    */

    user.otp = undefined;

    await user.save();

    return res.status(200).json({

      success: true,

      message:
        "Login successful",

      data: user,
    });

  } catch (err) {

    return res.status(500).json({

      success: false,

      error:
        err.message,
    });
  }
};

/*
================================================================================
6. RESEND OTP
================================================================================
*/

exports.resendOTP = async (req, res) => {

  try {

    const {
      
      parentPhone,
    } = req.body;
   const { schoolId } = req.user;

    const user =
      await User.findOne({

        schoolId,

        "parent.phone":
          parentPhone,
      });

    if (!user) {

      return res.status(404).json({

        success: false,

        message:
          "User not found",
      });
    }

    const otp =
      Math.floor(
        100000 +
        Math.random() * 900000
      ).toString();

    user.otp = {

      code: otp,

      expiresAt:
        new Date(
          Date.now() +
          10 * 60 * 1000
        ),

      attempts: 0,
    };

    await user.save();

    return res.status(200).json({

      success: true,

      message:
        "OTP resent successfully",

      data: {
        otp,
      },
    });

  } catch (err) {

    return res.status(500).json({

      success: false,

      error:
        err.message,
    });
  }
};

/*
================================================================================
7. UPDATE CHILD
================================================================================
*/

exports.updateStudent = async (req, res) => {
  try {
    const { parentId } = req.params;
    const { schoolId } = req.user;

    const { 
      parent, 
      child, // The dynamic array sent from frontend matrix
      busNumber, 
      pickupPointId 
    } = req.body;

    // Find the master parent document
    const user = await User.findOne({
      _id: parentId,
      schoolId: schoolId
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "Parent profile not found",
      });
    }

    /*
    =====================================
    1. UPDATE PARENT CORE DATA
    =====================================
    */
    if (parent) {
      if (parent.name !== undefined) user.parent.name = parent.name;
      if (parent.phone !== undefined) user.parent.phone = parent.phone;
    }

    /*
    =====================================
    2. SYNCHRONIZE CHILD NESTED STACK
    =====================================
    */
    if (child && Array.isArray(child)) {
      user.children = child.map(c => {
        // Generate clean custom tracking strings
        const calculatedStudentId = c.studentId || `STU-${Date.now().toString().slice(-6)}`;
        
        // Match existing document _id if available, otherwise let Mongoose create an ObjectId
        const subdocId = (c._id && mongoose.Types.ObjectId.isValid(c._id)) ? c._id : new mongoose.Types.ObjectId();

        return {
          _id: subdocId, 
           // Fulfills schema: required: true
          studentId: calculatedStudentId, // Fulfills schema: required: true
          name: c.studentName || c.name,
          class: c.class || "N/A",
          section: c.section || "-",     // Fulfills schema validation if empty string
          rollNumber: c.rollNumber || "-", // Fulfills schema validation if empty string
          busNumber: busNumber || c.busNumber || "Unassigned",
          pickupPointId: pickupPointId || c.pickupPointId || null,
          status: { active: true }
        };
      });
    }

    /*
    =====================================
    3. SAVE CHANGES
    =====================================
    */
    await user.save();

    return res.status(200).json({
      success: true,
      message: "Parent workspace node and nested student array updated completely!",
      data: user,
    });

  } catch (err) {
    return res.status(500).json({
      success: false,
      error: err.message,
    });
  }
};

/*
================================================================================
8. DELETE CHILD
================================================================================
*/

exports.deleteParent = async (req, res) => {
  try {
    const { parentId } = req.params; // Extracted from URL params
    const { schoolId } = req.user;   // Extracted from auth middleware

    if (!parentId) {
      return res.status(400).json({
        success: false,
        message: "Parent ID is required",
      });
    }

    // Direct deletion query using only parentId and schoolId custom fields
    const result = await User.deleteOne({
      parentId: parentId,
      schoolId: schoolId,
    });

    // Check if a document was actually found and deleted
    if (result.deletedCount === 0) {
      return res.status(404).json({
        success: false,
        message: "Parent profile not found under this school context",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Parent and all nested children deleted successfully",
    });
  } catch (error) {
    console.error("Error executing parent deletion query:", error);

    return res.status(500).json({
      success: false,
      message: "Server Error during document deletion process",
    });
  }
};
exports.deleteChild = async (
  req,
  res
) => {
  try {
    const {
      parentId,
      childId,
    } = req.params;

    const { schoolId } =
      req.user;

    const parent =
      await User.findOne({
        parentId,
        schoolId,
      });

    if (!parent) {
      return res.status(404).json({
        success: false,
        message:
          "Parent not found",
      });
    }

    const childExists =
      parent.children.some(
        (child) =>
          child.studentId ===
          childId
      );

    if (!childExists) {
      return res.status(404).json({
        success: false,
        message:
          "Student not found",
      });
    }

    parent.children =
      parent.children.filter(
        (child) =>
          child.studentId !==
          childId
      );

    await parent.save();

    return res.status(200).json({
      success: true,
      message:
        "Student deleted successfully",
      data: parent,
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
/*================================================================================
9. SAVE FCM TOKEN
================================================================================
*/

exports.saveFcmToken = async (req, res) => {

  try {

    const {
      parentId,
      fcmToken,
    } = req.body;

    const { schoolId } = req.user;

    if (
      !parentId ||
      !fcmToken
    ) {

      return res.status(400).json({

        success: false,

        message:
          "parentId and fcmToken required",
      });
    }

    const user =
      await User.findOne({
        parentId,
      });

    if (!user) {

      return res.status(404).json({

        success: false,

        message:
          "User not found",
      });
    }

    user.fcmToken =
      fcmToken;

    await user.save();

    return res.status(200).json({

      success: true,

      message:
        "FCM token saved successfully",

      data: {

        parentId:
          user.parentId,

        fcmToken:
          user.fcmToken,
      },
    });

  } catch (err) {

    return res.status(500).json({

      success: false,

      error:
        err.message,
    });
  }
};

/*
================================================================================
10. GET PARENT BY ID
================================================================================
*/

exports.getParentById = async (req, res) => {
  try {

    const { parentId } = req.params;
    const { schoolId } = req.user;

    const user = await User.findOne({
      parentId,
      schoolId,
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "Parent not found",
      });
    }

    return res.status(200).json({
      success: true,
      data: user,
    });

  } catch (err) {

    return res.status(500).json({
      success: false,
      error: err.message,
    });

  }
};

/*
================================================================================
11. GET PARENTS PAGINATION
================================================================================
*/

exports.getParentsPagination = async (req, res) => {

  try {

    let {
      page = 1,
      limit = 10,
      search = "",
    } = req.query;

    page = Number(page);
    limit = Number(limit);

    const query = {};

    if (search) {
      query.$or = [
        {
          "parent.name": {
            $regex: search,
            $options: "i",
          },
        },
        {
          "parent.phone": {
            $regex: search,
            $options: "i",
          },
        },
        {
          parentId: {
            $regex: search,
            $options: "i",
          },
        },
      ];
    }

    const totalRecords =
      await User.countDocuments(query);

    const data =
      await User.find(query)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit);

    return res.status(200).json({

      success: true,

      pagination: {
        totalRecords,
        currentPage: page,
        totalPages: Math.ceil(
          totalRecords / limit
        ),
        limit,
      },

      data,
    });

  } catch (err) {

    return res.status(500).json({
      success: false,
      error: err.message,
    });

  }
};

/*
================================================================================
12. GET SINGLE CHILD
================================================================================
*/

exports.getChildById = async (req, res) => {

  try {

    const {
      parentId,
      childId,
    } = req.params;

    const user =
      await User.findOne({
        parentId,
      });

    if (!user) {

      return res.status(404).json({
        success: false,
        message: "Parent not found",
      });
    }

    const child =
      user.children.find(
        (c) =>
          c.childId === childId
      );

    if (!child) {

      return res.status(404).json({
        success: false,
        message: "Child not found",
      });
    }

    return res.status(200).json({

      success: true,

      data: child,
    });

  } catch (err) {

    return res.status(500).json({
      success: false,
      error: err.message,
    });

  }
};