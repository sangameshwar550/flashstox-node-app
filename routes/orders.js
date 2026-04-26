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

const ORDER_PROJECTION = {
  SECNAME: 1,
  SHORTNAME: 1,
  EXCHANGE: 1,
  CMP: 1,
  MARKETCAP: 1,
  ORDER_VALUE: 1,
  ORDER_PERCENTAGE: 1,
  CREATED_TIME: 1,
  ALERT_DATE: 1,
  ONE_LINE_OUTPUT: 1,
  PRIORITY: 1,
  LTP: 1,
  PcChg: 1,
  pChange: 1,
  CURRENCY_CODE: 1,
  HEADLINE: 1,
  TITLE: 1,
  PE: 1,
};

// GET /api/orders/recent?days=5&limit=50&exchange=BSE
router.get("/recent", async (req, res) => {
  const days = parseInt(req.query.days) || 5;
  const limit = parseInt(req.query.limit) || 50;
  const exchange = req.query.exchange || null;

  log("INFO", "Fetching recent orders", { days, limit, exchange });

  try {
    const client = await connectToDatabase();
    const db = client.db(process.env.DB_NAME || "flashstox");

    const since = getLastNDaysDate(days);
    const query = { CREATED_TIME: { $gte: since }, TAG: ORDER_TAG_FILTER };
    if (exchange) query.EXCHANGE = exchange.toUpperCase();

    const orders = await db
      .collection("alerts")
      .find(query, { projection: ORDER_PROJECTION })
      .sort({ CREATED_TIME: -1 })
      .limit(limit)
      .toArray();

    log("INFO", "Recent orders fetched", { count: orders.length });
    res.json({ count: orders.length, days, orders });
  } catch (err) {
    log("ERROR", "Failed to fetch recent orders", {
      error: err.message,
      stack: err.stack,
    });
    res.status(500).json({ error: "Failed to fetch recent orders" });
  }
});

// GET /api/orders/large?days=5&threshold=50
router.get("/large", async (req, res) => {
  const days = parseInt(req.query.days) || 10;
  const threshold = parseFloat(req.query.threshold) || 30;

  log("INFO", "Fetching large orders", { days, threshold });

  try {
    const client = await connectToDatabase();
    const db = client.db(process.env.DB_NAME || "flashstox");

    const since = getLastNDaysDate(days);
    const orders = await db
      .collection("alerts")
      .find(
        {
          CREATED_TIME: { $gte: since },
          TAG: ORDER_TAG_FILTER,
          $expr: { $gte: [{ $toDouble: "$ORDER_PERCENTAGE" }, threshold] },
        },
        { projection: ORDER_PROJECTION },
      )
      .sort({ CREATED_TIME: -1 })
      .toArray();

    log("INFO", "Large orders fetched", { count: orders.length });
    res.json({ count: orders.length, threshold, days, orders });
  } catch (err) {
    log("ERROR", "Failed to fetch large orders", {
      error: err.message,
      stack: err.stack,
    });
    res.status(500).json({ error: "Failed to fetch large orders" });
  }
});

// GET /api/orders/search?q=infosys&days=5&limit=50
router.get("/search", async (req, res) => {
  const q = (req.query.q || "").trim();
  const days = parseInt(req.query.days) || 5;
  const limit = parseInt(req.query.limit) || 50;

  log("INFO", "Searching orders", { q, days, limit });

  if (!q) return res.json({ count: 0, orders: [] });

  try {
    const client = await connectToDatabase();
    const db = client.db(process.env.DB_NAME || "flashstox");

    const since = getLastNDaysDate(days);
    const regex = new RegExp(q, "i");

    const orders = await db
      .collection("alerts")
      .find(
        {
          CREATED_TIME: { $gte: since },
          TAG: ORDER_TAG_FILTER,
          $or: [{ SECNAME: regex }, { SHORTNAME: regex }],
        },
        { projection: ORDER_PROJECTION }
      )
      .sort({ CREATED_TIME: -1 })
      .limit(limit)
      .toArray();

    log("INFO", "Search results", { q, count: orders.length });
    res.json({ count: orders.length, orders });
  } catch (err) {
    log("ERROR", "Search failed", { error: err.message, stack: err.stack });
    res.status(500).json({ error: "Search failed" });
  }
});

// GET /api/orders/repeat?months=3&minOrders=2
// Must be before /:symbol to avoid being caught as a symbol lookup
router.get("/repeat", async (req, res) => {
  const months = parseInt(req.query.months) || 3;
  const minOrders = parseInt(req.query.minOrders) || 2;

  log("INFO", "Fetching repeat orders", { months, minOrders });

  try {
    const client = await connectToDatabase();
    const db = client.db(process.env.DB_NAME || "flashstox");

    const since = new Date();
    since.setMonth(since.getMonth() - months);

    const stocks = await db
      .collection("alerts")
      .aggregate([
        { $match: { CREATED_TIME: { $gte: since }, TAG: ORDER_TAG_FILTER } },
        { $sort: { CREATED_TIME: -1 } },
        {
          $group: {
            _id: "$SECNAME",
            shortName: { $first: "$SHORTNAME" },
            count: { $sum: 1 },
            lastOrder: { $max: "$CREATED_TIME" },
            marketCap: { $first: "$MARKETCAP" },
            cmpLatest: { $first: "$CMP" },
            cmpFirst: { $last: "$CMP" },
            orders: {
              $push: {
                createdTime: "$CREATED_TIME",
                orderValue: "$ORDER_VALUE",
                orderPct: "$ORDER_PERCENTAGE",
                exchange: "$EXCHANGE",
                cmp: "$CMP",
                oneLineOutput: "$ONE_LINE_OUTPUT",
                marketCap: "$MARKETCAP",
              },
            },
          },
        },
        {
          $addFields: {
            totalOrderValue: {
              $reduce: {
                input: "$orders",
                initialValue: 0,
                in: {
                  $add: [
                    "$$value",
                    { $convert: { input: "$$this.orderValue", to: "double", onError: 0, onNull: 0 } },
                  ],
                },
              },
            },
            priceChangePct: {
              $let: {
                vars: {
                  first: { $convert: { input: "$cmpFirst", to: "double", onError: 0, onNull: 0 } },
                  latest: { $convert: { input: "$cmpLatest", to: "double", onError: 0, onNull: 0 } },
                },
                in: {
                  $cond: {
                    if: { $gt: ["$$first", 0] },
                    then: { $multiply: [{ $divide: [{ $subtract: ["$$latest", "$$first"] }, "$$first"] }, 100] },
                    else: null,
                  },
                },
              },
            },
          },
        },
        { $match: { count: { $gte: minOrders } } },
        { $sort: { count: -1 } },
        { $limit: 20 },
      ])
      .toArray();

    log("INFO", "Repeat orders fetched", { count: stocks.length });
    res.json({ count: stocks.length, months, minOrders, stocks });
  } catch (err) {
    log("ERROR", "Failed to fetch repeat orders", {
      error: err.message,
      stack: err.stack,
    });
    res.status(500).json({ error: "Failed to fetch repeat orders" });
  }
});

// GET /api/orders/:symbol
router.get("/:symbol", async (req, res) => {
  const symbol = req.params.symbol.toUpperCase();
  log("INFO", "Fetching orders for symbol", { symbol });

  try {
    const client = await connectToDatabase();
    const db = client.db(process.env.DB_NAME || "flashstox");

    const orders = await db
      .collection("alerts")
      .find({ SHORTNAME: symbol }, { projection: ORDER_PROJECTION })
      .sort({ CREATED_TIME: -1 })
      .limit(20)
      .toArray();

    log("INFO", "Symbol orders fetched", { symbol, count: orders.length });
    res.json({ symbol, count: orders.length, orders });
  } catch (err) {
    log("ERROR", "Failed to fetch symbol orders", {
      error: err.message,
      stack: err.stack,
    });
    res.status(500).json({ error: "Failed to fetch symbol orders" });
  }
});

module.exports = router;
