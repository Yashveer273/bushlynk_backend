const School = require("../models/School");

/*
==================================================
REGISTER SCHOOL
==================================================
*/

exports.registerSchool = async (req, res) => {

  try {

    const {
      schoolId,
      name,
      address,
      contact,
    } = req.body;

    /*
    =========================================
    VALIDATION
    =========================================
    */

    if (
      !schoolId ||
      !name ||
      !address ||
      !contact
    ) {

      return res.status(400).json({

        success: false,

        message:
          "schoolId, name, address and contact are required",
      });
    }

    /*
    =========================================
    NORMALIZE SCHOOL ID
    =========================================
    */

    let formattedSchoolId =
      schoolId.trim().toUpperCase();

    // prevent SCH-SCH001
    if (
      !formattedSchoolId.startsWith("SCH-")
    ) {

      formattedSchoolId =
        `SCH-${formattedSchoolId}`;
    }

    /*
    =========================================
    CHECK DUPLICATE SCHOOL
    =========================================
    */

    const existingSchool =
      await School.findOne({

        schoolId:
          formattedSchoolId,
      });

    if (existingSchool) {

      return res.status(409).json({

        success: false,

        message:
          "School already exists",
      });
    }

    /*
    =========================================
    CREATE SCHOOL
    =========================================
    */

    const school =
      await School.create({

        schoolId:
          formattedSchoolId,

        name:
          name.trim(),

        address:
          address.trim(),

        contact:
          contact.trim(),
      });

    return res.status(201).json({

      success: true,

      message:
        "School registered successfully",

      data:
        school,
    });

  } catch (err) {

    console.log(err);

    return res.status(500).json({

      success: false,

      error:
        err.message,
    });
  }
};