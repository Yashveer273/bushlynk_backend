const { geofenceEngine } = require("./geofence.engine");
const { subscriptionEngine } = require("./subscription.engine");
const { etaEngine } = require("./eta.engine");
const { nearbyEngine } = require("./nearby.engine");

const throttleMap = new Map();

/*
==================================================
ENGINE ORCHESTRATOR (THROTTLED)
==================================================
*/

async function runEngines(data) {
  try {
    const { busNumber } = data;

    const now = Date.now();
    const lastRun = throttleMap.get(busNumber) || 0;

    /*
    =========================================
    THROTTLE CONTROL (5 SEC PER BUS)
    =========================================
    */

    if (now - lastRun < 5000) {
      return; // skip processing
    }

    throttleMap.set(busNumber, now);

    /*
    =========================================
    RUN ENGINES
    =========================================
    */

    await Promise.allSettled([
      geofenceEngine(data),
      subscriptionEngine(data),
      etaEngine(data),
      nearbyEngine(data),
    ]);

  } catch (err) {
    console.log("Engine Orchestrator Error:", err);
  }
}

module.exports = { runEngines };