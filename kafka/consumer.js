const { Kafka } = require("kafkajs");

const { processLocation } =
  require("../services/locationService");

const redisClient =
  require("../config/redis");

const kafka = new Kafka({
  clientId: "bus-system",

  brokers: ["localhost:9092"],

  retry: {
    retries: 10,
  },
});

const consumer = kafka.consumer({
  groupId: "location-group",
});

/*
==================================================
START CONSUMER
==================================================
*/

async function startConsumer() {

  try {

    await consumer.connect();

    console.log(
      "✅ Kafka Consumer Connected"
    );

    await consumer.subscribe({
      topic: "bus-location",

      fromBeginning: false,
    });

    /*
    ==================================================
    REALTIME LOCATION PROCESSING
    ==================================================
    */

    await consumer.run({

      /*
      Better throughput
      */
      partitionsConsumedConcurrently: 3,

      eachMessage: async ({
        topic,
        partition,
        message,
      }) => {

        try {

          if (!message?.value) {
            return;
          }

          const data =
            JSON.parse(
              message.value.toString()
            );
console.log("Kafka Message Received:", data);
          /*
          ============================================
          VALIDATION
          ============================================
          */

          if (
            !data.schoolId ||
            !data.busNumber ||
            data.lat === undefined ||
            data.lng === undefined ||
            data.speed === undefined ||
            data.timestamp === undefined 
          ) {

            console.log(
              "❌ Invalid Kafka Payload"
            );

            return;
          }

          /*
          ============================================
          STORE LATEST LOCATION
          ============================================
          */

          const redisKey =
            `bus:latest:${data.schoolId}:${data.busNumber}`;

          await redisClient.set(
            redisKey,

            JSON.stringify(data),

            {
              EX: 120,
            }
          );

          /*
          ============================================
          PROCESS LOCATION
          ============================================
          */

          await processLocation(data);

        } catch (err) {

          console.log(
            "Kafka Processing Error:",
            err.message
          );
        }
      },
    });

  } catch (err) {

    console.log(
      "Kafka Consumer Start Error:",
      err.message
    );
  }
}

module.exports = startConsumer;