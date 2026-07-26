// ======================================================
// controllers/school.controller.js
// OPTIMIZED SCHOOL CONTROLLER
// Secure registration OTP verification
// Plain access token stored in School.token
// Timing headers readable from browser
// Existing School database schema preserved
// ======================================================

const crypto = require("node:crypto");
const { performance } = require("node:perf_hooks");
const mongoose = require("mongoose");
const jwt = require("jsonwebtoken");

const School = require("../models/School");
const Bus = require("../models/Bus");
const Driver = require("../models/Driver");
const PickupPoint = require("../models/PickupPoint");
const Students = require("../models/Students");

const JWT_SECRET = process.env.JWT_SECRET || "0000000";
const OTP_SECRET =
  process.env.OTP_SECRET ||
  process.env.JWT_SECRET ||
  "0000000-otp-secret";

const ACCESS_TOKEN_EXPIRES_IN =
  process.env.ACCESS_TOKEN_EXPIRES_IN || "30d";

const OTP_TOKEN_EXPIRES_IN =
  process.env.OTP_TOKEN_EXPIRES_IN || "5m";

const IS_PRODUCTION =
  process.env.NODE_ENV === "production";

/*
==================================================
INPUT HELPERS
==================================================
*/

const clean = (value) =>
  String(value ?? "").trim();

const cleanPhone = (value) =>
  clean(value).replace(/\D/g, "");

const cleanEmail = (value) =>
  clean(value).toLowerCase();

const formatSchoolId = (value) => {
  const schoolId = clean(value).toUpperCase();

  if (!schoolId) return "";

  return schoolId;
};

const isValidPhone = (phone) =>
  /^[6-9]\d{9}$/.test(phone);

const isValidEmail = (email) =>
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

/*
==================================================
TIMING HELPERS
==================================================

The expose header is added here so browser JavaScript
can read custom timing headers even when the general
CORS middleware did not include exposedHeaders.
*/

const setTimingHeaders = (
  res,
  apiStart,
  dbTime = 0,
) => {
  const apiTime =
    performance.now() - apiStart;

  const databaseValue =
    `${dbTime.toFixed(2)}ms`;

  const apiValue =
    `${apiTime.toFixed(2)}ms`;

  res.setHeader(
    "X-Database-Time",
    databaseValue,
  );

  res.setHeader(
    "X-API-Time",
    apiValue,
  );

  res.setHeader(
    "Access-Control-Expose-Headers",
    "X-Database-Time, X-API-Time",
  );

  return {
    databaseTime: databaseValue,
    apiTime: apiValue,
  };
};

const sendError = (
  res,
  error,
  label,
  apiStart,
  dbTime = 0,
) => {
  console.error(`${label}:`, error);

  const timing = setTimingHeaders(
    res,
    apiStart,
    dbTime,
  );

  return res
    .status(error.statusCode || 500)
    .json({
      success: false,
      message:
        error.statusCode
          ? error.message
          : "Server error",
      timing,
      ...(
        IS_PRODUCTION
          ? {}
          : { error: error.message }
      ),
    });
};

/*
==================================================
OTP HELPERS
==================================================
*/

const generateOtp = () =>
  crypto.randomInt(
    100000,
    1000000,
  ).toString();

const hashOtp = (otp) =>
  crypto
    .createHmac(
      "sha256",
      OTP_SECRET,
    )
    .update(clean(otp))
    .digest("hex");

const safeEqual = (
  firstValue,
  secondValue,
) => {
  const first =
    Buffer.from(firstValue);

  const second =
    Buffer.from(secondValue);

  return (
    first.length === second.length &&
    crypto.timingSafeEqual(
      first,
      second,
    )
  );
};

const generateOtpToken = ({
  purpose,
  otp,
  schoolId,
  name,
  phone,
}) =>
  jwt.sign(
    {
      purpose,
      schoolId,
      name,
      phone,
      otpHash: hashOtp(otp),
    },
    OTP_SECRET,
    {
      expiresIn:
        OTP_TOKEN_EXPIRES_IN,
    },
  );

const verifyOtpToken = ({
  otpToken,
  otp,
  purpose,
  schoolId,
  phone,
}) => {
  if (!otpToken || !otp) {
    const error = new Error(
      "OTP and OTP token are required",
    );

    error.statusCode = 400;
    throw error;
  }

  let decoded;

  try {
    decoded = jwt.verify(
      otpToken,
      OTP_SECRET,
    );
  } catch (_) {
    const error = new Error(
      "OTP expired or invalid",
    );

    error.statusCode = 401;
    throw error;
  }

  const otpMatched = safeEqual(
    hashOtp(otp),
    clean(decoded.otpHash),
  );

  const purposeMatched =
    decoded.purpose === purpose;

  const phoneMatched =
    cleanPhone(decoded.phone) === phone;

  const schoolMatched =
    !schoolId ||
    formatSchoolId(decoded.schoolId) ===
      schoolId;

  if (
    !otpMatched ||
    !purposeMatched ||
    !phoneMatched ||
    !schoolMatched
  ) {
    const error = new Error(
      "Invalid OTP",
    );

    error.statusCode = 401;
    throw error;
  }

  return decoded;
};

/*
==================================================
ACCESS TOKEN
==================================================
*/

const generateAccessToken = ({
  id,
  schoolId,
  phone,
  tokenVersion,
}) =>
  jwt.sign(
    {
      id: String(id),
      schoolId,
      phone,
      tv: tokenVersion,
    },
    JWT_SECRET,
    {
      expiresIn:
        ACCESS_TOKEN_EXPIRES_IN,
    },
  );

/*
==================================================
1. START REGISTRATION
POST /register/start
==================================================

OTP is printed only in the backend console.
The response receives a signed OTP token containing
only the OTP hash.
*/

exports.startRegistration =
  async (req, res) => {
    const apiStart =
      performance.now();

    let dbTime = 0;

    try {
      const schoolId =
        formatSchoolId(
          req.body?.schoolId,
        );

      const name =
        clean(req.body?.name);

      const phone =
        cleanPhone(
          req.body?.phone,
        );

      if (
        !schoolId ||
        !name ||
        !phone
      ) {
        const timing =
          setTimingHeaders(
            res,
            apiStart,
            dbTime,
          );

        return res
          .status(400)
          .json({
            success: false,
            message:
              "schoolId, name and phone are required",
            timing,
          });
      }

      if (!isValidPhone(phone)) {
        const timing =
          setTimingHeaders(
            res,
            apiStart,
            dbTime,
          );

        return res
          .status(400)
          .json({
            success: false,
            message:
              "Invalid phone number",
            timing,
          });
      }

      const dbStart =
        performance.now();

      const existing =
        await School.exists({
          $or: [
            { schoolId },
            {
              "contact.phone": phone,
            },
          ],
        });

      dbTime =
        performance.now() -
        dbStart;

      if (existing) {
        const timing =
          setTimingHeaders(
            res,
            apiStart,
            dbTime,
          );

        return res
          .status(409)
          .json({
            success: false,
            message:
              "School ID or phone is already registered",
            timing,
          });
      }

      const otp =
        generateOtp();

      const otpToken =
        generateOtpToken({
          purpose:
            "SCHOOL_REGISTRATION",
          otp,
          schoolId,
          name,
          phone,
        });

      /*
      Development testing:
      OTP is visible only in Node.js console.
      */
      console.log(
        "\n======================================",
      );

      console.log(
        `REGISTRATION OTP: ${otp}`,
      );

      console.log(
        `SCHOOL ID: ${schoolId}`,
      );

      console.log(
        `PHONE: ${phone}`,
      );

      console.log(
        "======================================\n",
      );

      const timing =
        setTimingHeaders(
          res,
          apiStart,
          dbTime,
        );

      return res
        .status(200)
        .json({
          success: true,
          message:
            "OTP generated. Check backend console.",
          otpToken,
          expiresIn:
            OTP_TOKEN_EXPIRES_IN,
          schoolData: {
            schoolId,
            name,
            phone,
          },
          timing,
        });
    } catch (error) {
      return sendError(
        res,
        error,
        "startRegistration",
        apiStart,
        dbTime,
      );
    }
  };

/*
==================================================
2. COMPLETE REGISTRATION
POST /register/complete
==================================================

The school is created only after backend OTP
verification succeeds.
*/

exports.completeRegistration =
  async (req, res) => {
    const apiStart =
      performance.now();

    let dbTime = 0;

    try {
      const schoolId =
        formatSchoolId(
          req.body?.schoolId,
        );

      const name =
        clean(req.body?.name);

      const phone =
        cleanPhone(
          req.body?.phone,
        );

      const email =
        cleanEmail(
          req.body?.email,
        );

      const otp =
        clean(req.body?.otp);

      const otpToken =
        clean(req.body?.otpToken);

      const address =
        req.body?.address || {};

      if (
        !schoolId ||
        !name ||
        !phone ||
        !email ||
        !otp ||
        !otpToken
      ) {
        const timing =
          setTimingHeaders(
            res,
            apiStart,
            dbTime,
          );

        return res
          .status(400)
          .json({
            success: false,
            message:
              "schoolId, name, phone, email, otp and otpToken are required",
            timing,
          });
      }

      if (!isValidPhone(phone)) {
        const timing =
          setTimingHeaders(
            res,
            apiStart,
            dbTime,
          );

        return res
          .status(400)
          .json({
            success: false,
            message:
              "Invalid phone number",
            timing,
          });
      }

      if (!isValidEmail(email)) {
        const timing =
          setTimingHeaders(
            res,
            apiStart,
            dbTime,
          );

        return res
          .status(400)
          .json({
            success: false,
            message:
              "Invalid email format",
            timing,
          });
      }

      const challenge =
        verifyOtpToken({
          otpToken,
          otp,
          purpose:
            "SCHOOL_REGISTRATION",
          schoolId,
          phone,
        });

      if (
        clean(challenge.name) &&
        clean(challenge.name) !==
          name
      ) {
        const timing =
          setTimingHeaders(
            res,
            apiStart,
            dbTime,
          );

        return res
          .status(400)
          .json({
            success: false,
            message:
              "School name does not match registration request",
            timing,
          });
      }

      const _id =
        new mongoose.Types.ObjectId();

      const tokenVersion = 1;

      const token =
        generateAccessToken({
          id: _id,
          schoolId,
          phone,
          tokenVersion,
        });
console.log(token);
      const dbStart =
        performance.now();

      const school =
        await School.create({
          _id,
          schoolId,
          name,
          contact: {
            phone,
            email,
          },
          address: {
            line1:
              clean(address.line1),
            city:
              clean(address.city),
            state:
              clean(address.state),
            country:
              clean(address.country),
            pincode:
              clean(address.pincode),
            latitude:
              address.latitude === "" ||
              address.latitude ===
                undefined ||
              address.latitude === null
                ? null
                : Number(
                    address.latitude,
                  ),
            longitude:
              address.longitude === "" ||
              address.longitude ===
                undefined ||
              address.longitude === null
                ? null
                : Number(
                    address.longitude,
                  ),
          },
          tokenVersion,
          token,
      isVerified:true
        });

      dbTime =
        performance.now() -
        dbStart;

      const timing =
        setTimingHeaders(
          res,
          apiStart,
          dbTime,
        );

      return res
        .status(201)
        .json({
          success: true,
          message:
            "Registration successful",
          token,
          school,
          timing,
        });
    } catch (error) {
      if (error?.code === 11000) {
        const timing =
          setTimingHeaders(
            res,
            apiStart,
            dbTime,
          );

        return res
          .status(409)
          .json({
            success: false,
            message:
              "School ID, phone or email is already registered",
            timing,
          });
      }

      return sendError(
        res,
        error,
        "completeRegistration",
        apiStart,
        dbTime,
      );
    }
  };

/*
==================================================
3. LOGIN / GENERATE OTP
POST /login
==================================================
*/

exports.loginSchool =
  async (req, res) => {
    const apiStart =
      performance.now();

    let dbTime = 0;

    try {
      const phone =
        cleanPhone(
          req.body?.phone,
        );

      if (!phone) {
        const timing =
          setTimingHeaders(
            res,
            apiStart,
            dbTime,
          );

        return res
          .status(400)
          .json({
            success: false,
            message:
              "Phone required",
            timing,
          });
      }

      if (!isValidPhone(phone)) {
        const timing =
          setTimingHeaders(
            res,
            apiStart,
            dbTime,
          );

        return res
          .status(400)
          .json({
            success: false,
            message:
              "Invalid phone number",
            timing,
          });
      }

      const dbStart =
        performance.now();

      const school =
        await School.findOne(
          {
            "contact.phone": phone ,
            isVerified: true,
          },
          {
            _id: 1,
            schoolId: 1,
            name: 1,
            "contact.phone": 1,
          },
        ).lean();

      dbTime =
        performance.now() -
        dbStart;

      if (!school) {
        const timing =
          setTimingHeaders(
            res,
            apiStart,
            dbTime,
          );

        return res
          .status(404)
          .json({
            success: false,
            message:
              "School not found",
            timing,
          });
      }

      const otp =
        generateOtp();

      const otpToken =
        generateOtpToken({
          purpose:
            "SCHOOL_LOGIN",
          otp,
          schoolId:
            school.schoolId,
          name:
            school.name,
          phone,
        });

      console.log(
        "\n======================================",
      );

      console.log(
        `LOGIN OTP: ${otp}`,
      );

      console.log(
        `PHONE: ${phone}`,
      );

      console.log(
        "======================================\n",
      );

      const timing =
        setTimingHeaders(
          res,
          apiStart,
          dbTime,
        );

      return res
        .status(200)
        .json({
          success: true,
          message:
            "OTP generated. Check backend console.",
          otpToken,
          expiresIn:
            OTP_TOKEN_EXPIRES_IN,
          phone,
          timing,
        });
    } catch (error) {
      return sendError(
        res,
        error,
        "loginSchool",
        apiStart,
        dbTime,
      );
    }
  };

/*
==================================================
4. VERIFY LOGIN OTP
POST /login/verify-otp
==================================================
*/

exports.verifyLoginOtp =
  async (req, res) => {
    const apiStart =
      performance.now();

    let dbTime = 0;

    try {
      const phone =
        cleanPhone(
          req.body?.phone,
        );

      const otp =
        clean(req.body?.otp);

      const otpToken =
        clean(req.body?.otpToken);

      if (
        !phone ||
        !otp ||
        !otpToken
      ) {
        const timing =
          setTimingHeaders(
            res,
            apiStart,
            dbTime,
          );

        return res
          .status(400)
          .json({
            success: false,
            message:
              "Phone, OTP and OTP token are required",
            timing,
          });
      }

      verifyOtpToken({
        otpToken,
        otp,
        purpose:
          "SCHOOL_LOGIN",
        phone,
      });

      const firstDbStart =
        performance.now();

      const school =
        await School.findOneAndUpdate(
          {
            "contact.phone": phone,
            isVerified: true,
          },
          {
            $inc: {
              tokenVersion: 1,
            },
          },
          {
            new: true,
            projection: {
              _id: 1,
              schoolId: 1,
              tokenVersion: 1,
              "contact.phone": 1,
            },
            lean: true,
          },
        );

      dbTime +=
        performance.now() -
        firstDbStart;

      if (!school) {
        const timing =
          setTimingHeaders(
            res,
            apiStart,
            dbTime,
          );

        return res
          .status(404)
          .json({
            success: false,
            message:
              "School not found",
            timing,
          });
      }

      const token =
        generateAccessToken({
          id: school._id,
          schoolId:
            school.schoolId,
          phone:
            school.contact.phone,
          tokenVersion:
            school.tokenVersion,
        });

      const secondDbStart =
        performance.now();

      await School.updateOne(
        {
          _id: school._id,
          tokenVersion:
            school.tokenVersion,
        },
        {
          $set: {
            token,
          },
        },
      );

      dbTime +=
        performance.now() -
        secondDbStart;

      const timing =
        setTimingHeaders(
          res,
          apiStart,
          dbTime,
        );

      return res
        .status(200)
        .json({
          success: true,
          message:
            "Login successful",
          token,
          timing,
        });
    } catch (error) {
      return sendError(
        res,
        error,
        "verifyLoginOtp",
        apiStart,
        dbTime,
      );
    }
  };

/*
==================================================
5. GET PROFILE
GET /profile
==================================================
*/

exports.getProfile =
  async (req, res) => {
    const apiStart =
      performance.now();

    let dbTime = 0;

    try {
      const schoolObjectId =
        req.user?.id;

      const schoolId =
        clean(
          req.user?.schoolId,
        );

      if (
        !schoolObjectId ||
        !schoolId
      ) {
        const timing =
          setTimingHeaders(
            res,
            apiStart,
            dbTime,
          );

        return res
          .status(401)
          .json({
            success: false,
            message:
              "Invalid authenticated school",
            timing,
          });
      }

      const dbStart =
        performance.now();

      const [
        school,
        totalBuses,
        activeBuses,
        totalDrivers,
        studentCount,
        pickupCount,
      ] = await Promise.all([
        School.findById(
          schoolObjectId,
          {
            _id: 1,
            schoolId: 1,
            name: 1,
            address: 1,
            contact: 1,
            isVerified: 1,
            createdAt: 1,
          },
        ).lean(),

        Bus.countDocuments({
          schoolId,
        }),

        Bus.countDocuments({
          schoolId,
          "status.active": true,
        }),

        Driver.countDocuments({
          schoolId,
        }),

        Students.aggregate([
          {
            $match: {
              schoolId,
            },
          },
          {
            $group: {
              _id: null,
              totalStudents: {
                $sum: {
                  $size: {
                    $ifNull: [
                      "$children",
                      [],
                    ],
                  },
                },
              },
            },
          },
        ]),

        PickupPoint.aggregate([
          {
            $match: {
              schoolId,
            },
          },
          {
            $group: {
              _id: null,
              totalPickupPoints: {
                $sum: {
                  $size: {
                    $ifNull: [
                      "$pickupPoints",
                      [],
                    ],
                  },
                },
              },
            },
          },
        ]),
      ]);

      dbTime =
        performance.now() -
        dbStart;

      if (!school) {
        const timing =
          setTimingHeaders(
            res,
            apiStart,
            dbTime,
          );

        return res
          .status(404)
          .json({
            success: false,
            message:
              "School not found",
            timing,
          });
      }

      const totalStudents =
        studentCount[0]
          ?.totalStudents || 0;

      const totalPickupPoints =
        pickupCount[0]
          ?.totalPickupPoints || 0;

      const timing =
        setTimingHeaders(
          res,
          apiStart,
          dbTime,
        );

      return res
        .status(200)
        .json({
          success: true,
          dashboard: {
            school: {
              id: school._id,
              schoolId:
                school.schoolId,
              name: school.name,
              verified:
                school.isVerified,
              createdAt:
                school.createdAt,
              contact: {
                phone:
                  school.contact
                    ?.phone,
                email:
                  school.contact
                    ?.email,
              },
              address:
                school.address,
            },
            analytics: {
              totalBuses,
              activeBuses,
              totalDrivers,
              totalStudents,
              totalPickupPoints,
            },
          },
          timing,
        });
    } catch (error) {
      return sendError(
        res,
        error,
        "getProfile",
        apiStart,
        dbTime,
      );
    }
  };

/*
==================================================
6. LOGOUT
DELETE /logout
==================================================
*/

exports.logoutSchool =
  async (req, res) => {
    const apiStart =
      performance.now();

    let dbTime = 0;

    try {
      const dbStart =
        performance.now();

      const result =
        await School.updateOne(
          {
            _id: req.user?.id,
          },
          {
            $inc: {
              tokenVersion: 1,
            },
            $set: {
              token: null,
            },
          },
        );

      dbTime =
        performance.now() -
        dbStart;

      if (
        result.matchedCount === 0
      ) {
        const timing =
          setTimingHeaders(
            res,
            apiStart,
            dbTime,
          );

        return res
          .status(404)
          .json({
            success: false,
            message:
              "School not found",
            timing,
          });
      }

      const timing =
        setTimingHeaders(
          res,
          apiStart,
          dbTime,
        );

      return res
        .status(200)
        .json({
          success: true,
          message:
            "Logout successful",
          timing,
        });
    } catch (error) {
      return sendError(
        res,
        error,
        "logoutSchool",
        apiStart,
        dbTime,
      );
    }
  };