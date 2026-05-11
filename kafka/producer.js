const { Kafka } = require("kafkajs");

const kafka = new Kafka({
  clientId: "bus-system",
  brokers: ["localhost:9092"],
});

const producer = kafka.producer();

(async () => {
  await producer.connect();
})();

/**
 * Send event to Kafka
 */
function sendToKafka(data) {
  producer.send({
    topic: "bus-location",
    messages: [
      {
        key: `${data.schoolId}-${data.busNumber}`, // ensures ordering per bus
        value: JSON.stringify(data),
      },
    ],
  });
}

module.exports = { sendToKafka };

/*
WHY:
- Decouples API from processing
- Handles spikes safely
*/