require("dotenv").config();
const express = require("express");
const http = require("http");
const cors = require("cors");

const connectDB = require("./config/db");
const { initSocket } = require("./sockets/socketManager");

const healthRouter = require("./routes/health");
const usersRouter = require("./routes/users");
const chatsRouter = require("./routes/chats");
const filesRouter = require("./routes/files");

const errorHandler = require("./middleware/errorHandler");

const app = express();
const PORT = process.env.PORT || 8001;

// Connect to MongoDB
connectDB();

// Create HTTP server wrapping the Express app
const server = http.createServer(app);

const allowedOrigins = [
  "http://localhost:3000",
  "http://localhost:3001",
  "http://localhost:5173",
];

if (process.env.CORS_ORIGIN) {
  allowedOrigins.push(process.env.CORS_ORIGIN);
}

const checkOrigin = (origin, callback) => {
  // Allow requests with no origin (like mobile apps, curl, etc.)
  if (!origin) return callback(null, true);

  const isAllowed = allowedOrigins.some(
    (allowed) => origin === allowed || origin.startsWith(allowed)
  );
  const isVercel = origin.endsWith(".vercel.app");

  if (isAllowed || isVercel) {
    callback(null, true);
  } else {
    callback(new Error("Not allowed by CORS"));
  }
};

// Initialize Socket.IO with dynamic CORS check
initSocket(server, checkOrigin);

// ---------- Middleware ----------
app.use(cors({
  origin: checkOrigin,
  credentials: true
}));
app.use(express.json());

// ---------- Routes ----------
app.use("/api", healthRouter);
app.use("/api", filesRouter); // registers /api/upload and /api/files/:fileId/download
app.use("/api/users", usersRouter);
app.use("/api/chats", chatsRouter);

// ---------- Global Error Handler ----------
app.use(errorHandler);

// ---------- Start Server ----------
server.listen(PORT, () => {
  console.log(`[Server] HomeNexus running on port ${PORT}`);
});
