const router = require("express").Router();

const {
  registerBus,
  editBus,
  removeBus,
} = require("../controllers/bus.controller");

/*
=====================================
BUS ROUTES
=====================================
*/

/*
  Register new bus
*/
router.post(
  "/register",
  registerBus
);

/*
  Edit bus details
*/
router.put(
  "/editBus",
  editBus
);

/*
  Remove bus
*/
router.delete(
  "/removeBus",
  removeBus
);
const {
  getNextPickupPoint
} = require("../controllers/busRoute.controller");

router.get("/next-pickup-point", getNextPickupPoint);


module.exports = router;