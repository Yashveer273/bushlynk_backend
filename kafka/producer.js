const { Kafka } = require("kafkajs");

const kafka = new Kafka({

  clientId: "bus-system",

  brokers: ["localhost:9092"],

  retry: {
    retries: 10,
  },
});

const producer =
  kafka.producer();

let isConnected = false;

/*
==================================================
CONNECT PRODUCER
==================================================
*/

async function connectProducer() {

  if (isConnected) {
    return;
  }

  await producer.connect();

  isConnected = true;

  console.log(
    "✅ Kafka Producer Connected"
  );
}

/*
==================================================
SEND EVENT TO KAFKA
==================================================
*/

async function sendToKafka(data) {

  try {

    /*
    ==========================================
    VALIDATION
    ==========================================
    */

    if (
      !data.schoolId ||
      !data.busNumber
    ) {

      console.log(
        "❌ Invalid Kafka Data"
      );

      return;
    }

    /*
    ==========================================
    CONNECT
    ==========================================
    */

    await connectProducer();

    /*
    ==========================================
    SEND MESSAGE
    ==========================================
    */

    await producer.send({

      topic: "bus-location",

      messages: [
        {

          /*
          IMPORTANT:
          Same bus stays ordered
          */

          key:
            `${data.schoolId}-${data.busNumber}`,

          value:
            JSON.stringify({

              schoolId:
                data.schoolId,

              busNumber:
                data.busNumber,

              lat:
                Number(data.lat),

              lng:
                Number(data.lng),

              speed:
                data.speed || 0,

              timestamp:
                data.timestamp ||
                Date.now(),
            }),
        },
      ],
    });

  } catch (err) {

    console.log(
      "Kafka Producer Error:",
      err.message
    );
  }
}

module.exports = {
  sendToKafka,
};