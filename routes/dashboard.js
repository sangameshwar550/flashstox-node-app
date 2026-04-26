const { Router } = require("express");
const { connectToDatabase } = require("../config/db");
const { ORDER_TAG_FILTER } = require("./constants");

const router = Router();

function log(level, message, data = {}) {
  console.log(JSON.stringify({ timestamp: new Date().toISOString(), level, message, ...data }));
}

function getLastNDaysDate(days) {
  const date = new Date();
  date.setDate(date.getDate() - days);
  date.setHours(0, 0, 0, 0);
  return date;
}

function getStartOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

// GET /api/dashboard/summary?days=5&threshold=50
router.get("/summary", async (req, res) => {
  const days = parseInt(req.query.days) || 5;
  const threshold = parseFloat(req.query.threshold) || 30;

  log("INFO", "Fetching dashboard summary", { days, threshold });

  try {
    const client = await connectToDatabase();
    const db = client.db(process.env.DB_NAME || "flashstox");

    const since = getLastNDaysDate(days);
    const sinceForLarge = getLastNDaysDate(10);
    const todayStart = getStartOfToday();
    const baseFilter = { TAG: ORDER_TAG_FILTER };

    const [totalOrders, todayOrders, largeOrders, gainers] = await Promise.all([
      db.collection("alerts").countDocuments({
        ...baseFilter,
        CREATED_TIME: { $gte: since },
      }),
      db.collection("alerts").countDocuments({
        ...baseFilter,
        CREATED_TIME: { $gte: todayStart },
      }),
      db.collection("alerts")
        .find(
          { ...baseFilter, CREATED_TIME: { $gte: sinceForLarge }, $expr: { $gte: [{ $toDouble: "$ORDER_PERCENTAGE" }, threshold] } },
          { projection: { SHORTNAME: 1 } }
        )
        .toArray(),
      db.collection("daily_gainers2")
        .find({}, { projection: { symbol: 1, pChange: 1 } })
        .sort({ pChange: -1 })
        .limit(50)
        .toArray(),
    ]);

    const largeOrderSymbols = new Set(largeOrders.map((o) => o.SHORTNAME).filter(Boolean));
    const gainerSymbols = new Set(gainers.map((g) => g.symbol).filter(Boolean));
    const stocksInBoth = [...largeOrderSymbols].filter((sym) => gainerSymbols.has(sym));

    log("INFO", "Dashboard summary ready", { totalOrders, todayOrders, largeOrdersCount: largeOrders.length });

    res.json({
      totalOrders,
      todayOrders,
      largeOrdersCount: largeOrders.length,
      topGainersCount: gainers.length,
      stocksInBoth,
      days,
      threshold,
    });
  } catch (err) {
    log("ERROR", "Failed to fetch dashboard summary", { error: err.message, stack: err.stack });
    res.status(500).json({ error: "Failed to fetch dashboard summary" });
  }
});

module.exports = router;
