const express = require("express");
const router = express.Router();
const { sendToKafka } = require("../kafka/producer");

/**
 * Driver sends batched GPS data
 */
router.post("/location/batch", async (req, res) => {
  console.log("::::::::");
  const { schoolId, busNumber, driverId, locations ,speed,timestamp } = req.body;

  /*
  WHY BATCH:
  - Reduces API calls
  - Improves scalability
  */

  for (let loc of locations) {
    sendToKafka({
      timestamp,
      schoolId,
      busNumber,
      driverId,
      speed,
      ...loc,
    });
  }

  // respond immediately (DO NOT WAIT)
  res.json({ status: "queued", count: locations.length });
});

module.exports = router;