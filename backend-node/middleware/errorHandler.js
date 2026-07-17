function errorHandler(err, req, res, next) {
  if (err.message && err.message.includes("Unauthenticated")) {
    console.warn(`[Auth] Rejected unauthenticated request to: ${req.method} ${req.url}`);
    return res.status(401).json({ error: "Unauthenticated. Invalid or expired token." });
  }
  console.error("[Server Error]", err);
  res.status(500).json({ error: "Internal Server Error" });
}

module.exports = errorHandler;
