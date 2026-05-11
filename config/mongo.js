const mongoose = require("mongoose");

const connectDB = async () => {
  try {
    await mongoose.connect("mongodb://localhost:27017/bushlynk ")

    console.log("✅ MongoDB Connected...");
  } catch (err) {
    console.error("❌ MongoDB Connection Error:", err.message);
    process.exit(1); // Exit process with failure
  }
};

module.exports = connectDB;
// kafka start commands: 
//terminal 1:-bin\windows\kafka-server-start.bat config\server.properties*//
//terminal 2:-bin\windows\zookeeper-server-start.bat config\zookeeper.properties*//
//terminal 3:-bin\windows\kafka-topics.bat --create --topic bus-location --bootstrap-server localhost:9092 Created topic bus-location.
