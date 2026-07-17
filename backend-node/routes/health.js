const express = require("express");
const mongoose = require("mongoose");
const router = express.Router();

// Health check endpoint
router.get("/health", (req, res) => {
  res.json({
    ok: true,
    app: "HomeNexus Backend",
    database: mongoose.connection.readyState === 1 ? "connected" : "disconnected"
  });
});

module.exports = router;
