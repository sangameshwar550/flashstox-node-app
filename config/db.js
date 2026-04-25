const { MongoClient } = require("mongodb");
const uri = process.env.MONGODB_URI || "mongodb://localhost:27017/myDatabase";

let client;

async function connectToDatabase() {
  if (client) {
    try {
      await client.db().command({ ping: 1 });
      return client;
    } catch {
      console.log(
        JSON.stringify({
          timestamp: new Date().toISOString(),
          level: "WARN",
          message: "MongoDB connection lost, reconnecting...",
        }),
      );
      client = null;
    }
  }

  client = new MongoClient(uri, {
    serverSelectionTimeoutMS: 5000,
    connectTimeoutMS: 10000,
  });
  await client.connect();
  console.log(
    JSON.stringify({
      timestamp: new Date().toISOString(),
      level: "INFO",
      message: "Connected to MongoDB",
    }),
  );
  return client;
}

module.exports = { connectToDatabase };
