const mongoose = require("mongoose");

function connectDB() {
  const mongoUri = process.env.MONGO_URL;
  const dbName = process.env.DB_NAME || "test_database";

  if (!mongoUri) {
    console.error("[Database] Error: MONGO_URL environment variable is missing.");
    process.exit(1);
  }

  return mongoose.connect(mongoUri, { dbName })
    .then(async () => {
      console.log(`[Database] Connected successfully to MongoDB (${dbName})`);
      try {
        const User = require("../models/User");
        // Sync clerkId into missing user_id fields
        const resUserId = await User.updateMany(
          { user_id: { $exists: false } },
          [{ $set: { user_id: "$clerkId" } }]
        );
        // Sync user_id into missing clerkId fields
        const resClerkId = await User.updateMany(
          { clerkId: { $exists: false } },
          [{ $set: { clerkId: "$user_id" } }]
        );
        if (resUserId.modifiedCount > 0 || resClerkId.modifiedCount > 0) {
          console.log(`[Database Migration] Synced legacy user profiles (user_id/clerkId).`);
        }
      } catch (err) {
        console.error("[Database Migration] Failed to sync legacy user profiles:", err);
      }
    })
    .catch((err) => {
      console.error("[Database] Connection failed:", err);
      process.exit(1);
    });
}

module.exports = connectDB;
