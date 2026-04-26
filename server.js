require("dotenv").config();
const express = require("express");
const cors = require("cors");

const ordersRouter = require("./routes/orders");
const gainersRouter = require("./routes/gainers");
const dashboardRouter = require("./routes/dashboard");

const app = express();
const PORT = process.env.PORT || 8081;

app.use(
  cors({
    origin: [
      "http://localhost:3000",
      process.env.FRONTEND_URL,
      "https://orders.flashstox.com",
      "https://insights.flashstox.com",
    ].filter(Boolean),
  }),
);

function log(level, message, data = {}) {
  console.log(
    JSON.stringify({
      timestamp: new Date().toISOString(),
      level,
      message,
      ...data,
    }),
  );
}

app.use((req, _res, next) => {
  log("INFO", "Incoming request", { method: req.method, url: req.url });
  next();
});

app.get("/", (_req, res) => {
  res.json({
    status: "ok",
    endpoints: [
      "GET /api/orders/recent?days=5&limit=50&exchange=BSE|NSE",
      "GET /api/orders/large?days=5&threshold=50",
      "GET /api/orders/:symbol",
      "GET /api/top-gainers?limit=20",
      "GET /api/dashboard/summary?days=5&threshold=50",
    ],
  });
});

app.use("/api/orders", ordersRouter);
app.use("/api/top-gainers", gainersRouter);
app.use("/api/dashboard", dashboardRouter);

app.listen(PORT, () => {
  log("INFO", "Server started", { port: PORT });
});
