const router = require("express").Router();

const {
  registerSchool,
} = require("../controllers/school.controller");

router.post("/register", registerSchool);

module.exports = router;