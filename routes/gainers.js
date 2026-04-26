const { Router } = require("express");
const { connectToDatabase } = require("../config/db");

const router = Router();

function log(level, message, data = {}) {
  console.log(JSON.stringify({ timestamp: new Date().toISOString(), level, message, ...data }));
}

// GET /api/top-gainers?limit=20
router.get("/", async (req, res) => {
  const limit = parseInt(req.query.limit) || 20;

  log("INFO", "Fetching top gainers", { limit });

  try {
    const client = await connectToDatabase();
    const db = client.db(process.env.DB_NAME || "flashstox");

    const gainers = await db
      .collection("daily_gainers2")
      .find(
        {},
        {
          projection: {
            symbol: 1,
            lastPrice: 1,
            pChange: 1,
            change: 1,
            previousClose: 1,
            open: 1,
            dayHigh: 1,
            dayLow: 1,
            yearHigh: 1,
            yearLow: 1,
            totalTradedVolume: 1,
            totalTradedValue: 1,
            perChange30d: 1,
            perChange365d: 1,
            lastUpdateTime: 1,
            nearWKH: 1,
            nearWKL: 1,
          },
        }
      )
      .sort({ pChange: -1 })
      .limit(limit)
      .toArray();

    log("INFO", "Top gainers fetched", { count: gainers.length });
    res.json({ count: gainers.length, gainers });
  } catch (err) {
    log("ERROR", "Failed to fetch top gainers", { error: err.message, stack: err.stack });
    res.status(500).json({ error: "Failed to fetch top gainers" });
  }
});

module.exports = router;
