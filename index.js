const express = require("express");
const { startRetryWorker } = require("./workers/cronRunner");
const connectDB = require("./config/mongo");

const startConsumer = require("./kafka/consumer");
require("./config/firebase");
const { loadPickupPoints } = require("./services/loadpicups_in_redis");

const app = express();

app.use(express.json());

/*
=====================================
ROUTES
=====================================
*/
app.use("/api", require("./routes/location"));

app.use("/api/school", require("./routes/school.routes"));
app.use("/api/driver", require("./routes/driver.routes"));
app.use("/api/user", require("./routes/user.routes"));
app.use("/api/bus", require("./routes/bus.routes"));
app.use("/api/subscription", require("./routes/subscription.routes"));
app.use("/api/bus", require("./routes/bus.routes"));
app.use("/api/pickupPoint", require("./routes/pickupPoint.routes"));
/*
=====================================
START SERVER
=====================================
*/
async function startServer() {
  try {
    /*
    =====================================
    CONNECT MONGODB
    =====================================
    */
    await connectDB();

    /*
    =====================================
    LOAD STOP CACHE
    =====================================
    */
    await loadPickupPoints();

    /*
    =====================================
    START KAFKA CONSUMER
    =====================================
    */
    await startConsumer();
startRetryWorker();
    app.listen(3000, () => {
      console.log("✅ Server started on 3000");
    });
  } catch (err) {
    console.log("❌ Server Error:", err);
  }
}

startServer();
