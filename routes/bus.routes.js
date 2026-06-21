const router =
  require("express").Router();

/*
=====================================
CONTROLLERS
=====================================
*/

const {
  registerBus,
  editBus,
  removeBus,
  getAllBuses,assignDefaultDriverToBus
} = require("../controllers/bus.controller");

const {
  getNextPickupPoint
} = require("../controllers/busRoute.controller");

/*
=====================================
MIDDLEWARE
=====================================
*/

const {
  auth
} = require("../middlewares/school.auth");

/*
=====================================
BUS ROUTES
=====================================
*/

/*
-------------------------------------
REGISTER BUS
-------------------------------------
API:
POST /api/v1/bus/register
-------------------------------------
TOKEN:
Required
-------------------------------------
*/

router.post(
  "/register",
  auth,
  registerBus
);
router.post(
  "/assign-default-driver",
  auth,
  assignDefaultDriverToBus
);
/*
-------------------------------------
EDIT BUS
-------------------------------------
API:
PUT /api/v1/bus/editBus?busId=BUS_ID
-------------------------------------
TOKEN:
Required
-------------------------------------
*/

router.put(
  "/editBus",
  auth,
  editBus
);

/*
-------------------------------------
REMOVE BUS
-------------------------------------
API:
DELETE /api/v1/bus/removeBus?busId=BUS_ID
-------------------------------------
TOKEN:
Required
-------------------------------------
*/

router.delete(
  "/removeBus",
  auth,
  removeBus
);
router.get(
  "/all",
  auth,
  getAllBuses

);
// ----------------------------------------------------------------------------------------
/*
-------------------------------------
NEXT PICKUP POINT

TOKEN:
Required
-------------------------------------
*/

router.get(
  "/next-pickup-point",
  auth,
  getNextPickupPoint
);

module.exports = router;