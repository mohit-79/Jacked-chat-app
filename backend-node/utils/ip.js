// Helper to extract client's public IP address
function getClientIp(req) {
  const xff = req.headers["x-forwarded-for"];
  if (xff) {
    return xff.split(",")[0].trim();
  }
  return req.socket.remoteAddress || "unknown";
}

module.exports = {
  getClientIp
};
