const generateId = require("../utils/generateId");

const School = require("../models/School");

/*
  Register school
*/
exports.registerSchool = async (req, res) => {
  try {
    const {
      name,
      address,
      contact,

      schoolId,
    } = req.body;
    if (
      !schoolId ||
      schoolId.trim() === "" ||
      !name ||
      name.trim() === "" ||
      !address ||
      address.trim() === "" ||
      !contact ||
      contact.trim() === ""
    ) {
      return res.status(400).json({
        success: false,
        error: "schoolId is required",
      });
    }
    const school = await School.create({
      schoolId: `SCH-${schoolId}`,

      name,

      address,

      contact,
    });

    res.status(201).json({
      success: true,
      message: "School registered",

      data: school,
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: err.message,
    });
  }
};
