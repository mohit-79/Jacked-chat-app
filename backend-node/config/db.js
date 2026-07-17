const mongoose = require("mongoose");

function connectDB() {
  const mongoUri = process.env.MONGO_URL;
  const dbName = process.env.DB_NAME || "test_database";

  if (!mongoUri) {
    console.error("[Database] Error: MONGO_URL environment variable is missing.");
    process.exit(1);
  }

  return mongoose.connect(mongoUri, { dbName })
    .then(() => console.log(`[Database] Connected successfully to MongoDB (${dbName})`))
    .catch((err) => {
      console.error("[Database] Connection failed:", err);
      process.exit(1);
    });
}

module.exports = connectDB;
