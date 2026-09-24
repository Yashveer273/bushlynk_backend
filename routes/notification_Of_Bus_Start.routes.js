const express = require('express');
const {
  sendBusStartNotification,
  sendBusStopNotification,
} = require('../controllers/notification_Of_Bus_Start_controllers');

const router = express.Router();

router.post('/start', sendBusStartNotification);
router.post('/stop', sendBusStopNotification);

module.exports = router;
