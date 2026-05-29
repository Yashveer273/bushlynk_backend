const express = require("express");

const router = express.Router();

const {
  createPickupPoint,
  addStudent,
  removeStudent,
  removePickupPoint,
  addPickupPoint,
  editPickupPoint,
  changeBusId,
  removeCompleteBusPickupPoints,
  getPaginatedBusesWithPickupPoints,getPickupPointsByBus
} = require("../controllers/pickupPoint.Controller");
const { auth } = require("../middlewares/school.auth");
/*
==================================================
1. CREATE PICKUP POINT
==================================================

POST
/api/pickup-point/create

Thunder Client Body:

{
  "schoolId": "SCH001",
  "busNumber": "BUS101",

  "pickupPoint": {
    "pickupPointId": "PP001",

    "name": "Sector 12",

    "location": {
      "lat": 28.6139,
      "lng": 77.2090
    },

    "assignedStudents": [
      {
        "parentId": "PAR001"
      }
    ]
  }
}
*/

router.post("/create", auth, createPickupPoint);
router.put("/edit", auth, editPickupPoint);
router.get(
  "/get-buses-paginated",
  auth,
  getPaginatedBusesWithPickupPoints,
);
router.get(
  "/get-pickup-points/:busNumber",
  auth,
  getPickupPointsByBus,
);
router.put("/change-bus-id", auth, changeBusId);
/*
==================================================
2. ADD STUDENT
==================================================

POST
/api/pickup-point/add-student

Thunder Client Body:

{
  "schoolId": "SCH001",

  "pickupPointId": "PP001",

  "student": {
    "parentId": "PAR002"
  }
}
*/

router.post("/add-student", auth, addStudent);

/*
==================================================
3. REMOVE STUDENT
==================================================

POST
/api/pickup-point/remove-student

Thunder Client Body:

{
  "schoolId": "SCH001",

  "pickupPointId": "PP001",

  "parentId": "PAR002"
}
*/

router.post("/remove-student", auth, removeStudent);

/*
==================================================
4. REMOVE PICKUP POINT
==================================================

DELETE
/api/pickup-point/remove-pickup-point

Thunder Client Body:

{
  "schoolId": "SCH001",

  "pickupPointId": "PP001"
}
*/

router.delete("/remove-pickup-point", auth, removePickupPoint);
router.delete(
  "/remove-complete-bus-pickup-points",
  auth,
  removeCompleteBusPickupPoints,
);
/*
==================================================
5. ADD ADDITIONAL PICKUP POINT
==================================================

POST
/api/pickup-point/add-pickup-point

Thunder Client Body:

{
  "schoolId": "SCH001",
  "busNumber": "BUS101",

  "pickupPoint": {
    "pickupPointId": "PP002",

    "name": "Metro Station",

    "location": {
      "lat": 28.6121,
      "lng": 77.2015
    },

    "assignedStudents": []
  }
}
*/

router.post("/add-pickup-point", auth, addPickupPoint);

module.exports = router;
