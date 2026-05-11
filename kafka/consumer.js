const { Kafka } = require("kafkajs");
const { processLocation } = require("../services/locationService");
const redisClient = require("../config/redis");

const kafka = new Kafka({
  clientId: "bus-system",
  brokers: ["localhost:9092"],
});

const consumer = kafka.consumer({
  groupId: "location-group",
});

/*
==================================================
START CONSUMER (OPTIMIZED)
==================================================
*/

async function startConsumer() {
  await consumer.connect();
  await consumer.subscribe({ topic: "bus-location" });

  /*
  ==================================================
  STEP 1: INGEST KAFKA → STORE LATEST STATE ONLY
  ==================================================
  */

  await consumer.run({
    eachMessage: async ({ message }) => {
      const data = JSON.parse(message.value.toString());

      const key = `bus:latest:${data.busNumber}`;

      /*
      Redis SET with overwrite (latest state only)
      */
      await redisClient.set(key, JSON.stringify(data), {
        EX: 60,
      });

      /*
      🔥 IMPORTANT OPTIMIZATION:
      Immediately trigger processing instead of polling
      */
      await processLocation(data);
    },
  });

  /*
  ==================================================
  STEP 2 (REMOVED POLLING LOOP)
  ==================================================
  WHY REMOVED:
  - keys() was killing performance
  - unnecessary Redis scanning
  - Kafka already gives stream
  */

}

module.exports = startConsumer;