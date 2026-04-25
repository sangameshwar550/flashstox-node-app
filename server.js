require("dotenv").config();
const express = require("express");
const { connectToDatabase } = require("./config/db");

const app = express();
const PORT = process.env.PORT || 8081;

function log(level, message, data = {}) {
  console.log(JSON.stringify({ timestamp: new Date().toISOString(), level, message, ...data }));
}

app.use((req, _res, next) => {
  log("INFO", "Incoming request", { method: req.method, url: req.url });
  next();
});

app.get("/", (_req, res) => {
  res.send("Hello World from Google Cloud Run!");
});

app.get("/today-orders", async (_req, res) => {
  log("INFO", "Fetching last 20 orders");
  try {
    log("INFO", "Connecting to database");
    const client = await connectToDatabase();
    const db = client.db(process.env.DB_NAME || "flashstox");
    log("INFO", "Connected, querying alerts collection");

    const orders = await db
      .collection("alerts")
      .find({})
      .sort({ CREATED_TIME: -1 })
      .limit(20)
      .toArray();

    log("INFO", "Query successful", { count: orders.length });
    res.json({ count: orders.length, orders });
  } catch (err) {
    log("ERROR", "Failed to fetch orders", { error: err.message, stack: err.stack });
    res.status(500).json({ error: "Failed to fetch orders" });
  }
});

app.listen(PORT, () => {
  log("INFO", "Server started", { port: PORT });
});
