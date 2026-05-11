const express = require("express");
const router = express.Router();
const { sendToKafka } = require("../kafka/producer");

/**
 * Driver sends batched GPS data
 */
router.post("/location/batch", async (req, res) => {
  const { schoolId, busNumber, driverId, locations } = req.body;

  /*
  WHY BATCH:
  - Reduces API calls
  - Improves scalability
  */

  for (let loc of locations) {
    sendToKafka({
      schoolId,
      busNumber,
      driverId,
      ...loc,
    });
  }

  // respond immediately (DO NOT WAIT)
  res.json({ status: "queued", count: locations.length });
});

module.exports = router;