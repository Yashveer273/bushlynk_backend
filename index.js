const express = require("express");
const { startRetryWorker } = require("./workers/cronRunner");
const connectDB = require("./config/mongo");
const cors = require("cors");
const startConsumer = require("./kafka/consumer");
require("./config/firebase");
const { loadPickupPoints } = require("./services/loadpicups_in_redis");

const app = express();

app.use(
  cors({
    origin: "*",
    methods: "*",
  }),
);
app.use((req, res, next) => {
  const start = performance.now();

  res.on("finish", () => {
    console.log({
      method: req.method,
      url: req.originalUrl,
      status: res.statusCode,
      completeExpressTime:
        `${(performance.now() - start).toFixed(2)}ms`,
    });
  });

  next();
});
app.use(express.json());

/*
=====================================
ROUTES
=====================================
*/
app.use("/api", require("./routes/location"));

app.use("/api/school", require("./routes/school.routes"));
app.use("/api/driver", require("./routes/driver.routes"));
app.use("/api/student", require("./routes/user.routes"));

app.use("/api/subscription", require("./routes/subscription.routes"));
app.use("/api/bus", require("./routes/bus.routes"));
app.use("/api/pickupPoint", require("./routes/pickupPoint.routes"));
app.get("/", (req, res) => {
  res.status(200).json({
    success: true,
    message: "🚀 Test API Server is running",
    timestamp: new Date(),
  });
});
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
    // await startConsumer();
    startRetryWorker();
    app.listen(3000, "192.168.1.7", () => {
      console.log("✅ Server running on http://127.0.0.1:3000");
    });
  } catch (err) {
    console.log("❌ Server Error:", err);
  }
}

startServer();
