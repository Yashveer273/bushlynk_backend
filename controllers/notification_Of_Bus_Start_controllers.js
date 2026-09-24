const admin = require('firebase-admin');

const NOTIFICATION_TYPE = 'bus_tracking_service';
const SERVICE_CHANNEL = 'bus_tracking_control_v1';
const VALID_EVENTS = new Set(['bus_start', 'bus_stop']);
const VALID_TRIP_STAGES = new Set(['PICKUP', 'TO_SCHOOL', 'DROP_OFF']);

const normalizeText = (value) => String(value ?? '').trim();

const validateBusControlRequest = ({ fcmToken, deviceId, schoolId, event, tripStage }) => {
  const normalizedEvent = normalizeText(event);
  const normalizedTripStage = normalizeText(tripStage);

  if (!VALID_EVENTS.has(normalizedEvent)) {
    return {
      valid: false,
      message: 'event must be either bus_start or bus_stop.',
    };
  }
  if (!VALID_TRIP_STAGES.has(normalizedTripStage)) {
    return {
      valid: false,
      message: 'tripStage must be one of: PICKUP, TO_SCHOOL, DROP_OFF.',
    };
  }
  if (!fcmToken || !deviceId || !schoolId) {
    return {
      valid: false,
      message: 'fcmToken, deviceId, and schoolId are required.',
    };
  }

  return {
    valid: true,
    event: normalizedEvent,
  };
};

const sendBusStartNotification = async (req, res) => {
  return sendBusControlNotification(req, res, 'bus_start');
};

const sendBusStopNotification = async (req, res) => {
  return sendBusControlNotification(req, res, 'bus_stop');
};

const sendBusControlNotification = async (req, res, event) => {
  try {
    const fcmToken = normalizeText(req.body?.fcmToken);
    const schoolName = normalizeText(req.body?.schoolName);
    const deviceId = normalizeText(req.body?.deviceId);
    const schoolId = normalizeText(req.body?.schoolId);
    const tripStage = normalizeText(req.body?.tripStage || 'PICKUP');
    const validation = validateBusControlRequest({
      fcmToken,
      deviceId,
      schoolId,
      event,
      tripStage,
    });

    if (!validation.valid) {
      return res.status(400).json({
        success: false,
        message: validation.message,
      });
    }

    const data = {
      notificationType: NOTIFICATION_TYPE,
      serviceChannel: SERVICE_CHANNEL,
      event: validation.event,
      deviceId,
      schoolId,
      tripStage,
      schoolName
    };

    const notificationTitle = validation.event === 'bus_start' ? 'Bus started' : 'Bus stopped';
    const notificationBody = validation.event === 'bus_start'
      ? 'Your bus has started moving.'
      : 'Your bus has stopped.';


const messageId = await admin.messaging().send({
  token: fcmToken,

  // ============================================================
  // DATA ONLY
  // ============================================================
  //
  // IMPORTANT:
  //
  // Kotlin BusFirebaseMessagingService needs to receive the
  // event in the background so that it can start the foreground
  // service.
  //
  // ============================================================

  data,

  android: {
    priority: 'high',
    ttl: 60 * 1000,
  },

  apns: {
    payload: {
      aps: {
        contentAvailable: true,
      },
    },
  },
});



    return res.status(200).json({
      success: true,
      messageId,
      data,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      code: error?.code || 'messaging/send-failed',
      message: error?.message || 'Unable to send bus notification.',
    });
  }
};

module.exports = {
  sendBusStartNotification,
  sendBusStopNotification,
};
