require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const http = require("http");
const { Server } = require("socket.io");
const { ClerkExpressRequireAuth } = require("@clerk/clerk-sdk-node");
const crypto = require("crypto");
const multer = require("multer");
const path = require("path");
const fs = require("fs");

const User = require("./models/User");
const Message = require("./models/Message");
const File = require("./models/File"); 

const app = express();
const PORT = process.env.PORT || 8001;

// Create HTTP server wrapping the Express app
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: process.env.CORS_ORIGIN || "http://localhost:3000",
    methods: ["GET", "POST"],
    credentials: true
  }
});
global.io = io;

// ---------- Middleware ----------
app.use(cors({
  origin: process.env.CORS_ORIGIN || "http://localhost:3000",
  credentials: true
}));
app.use(express.json());

// ---------- Multer Storage Configuration (Local Disk) ----------
const uploadsDir = path.join(__dirname, "uploads");
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir);
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const fileId = crypto.randomUUID();
    const ext = path.extname(file.originalname);
    cb(null, `${fileId}${ext}`);
  }
});

const upload = multer({ storage });

// Helper to extract client's public IP address
function getClientIp(req) {
  const xff = req.headers["x-forwarded-for"];
  if (xff) {
    return xff.split(",")[0].trim();
  }
  return req.socket.remoteAddress || "unknown";
}

// ---------- MongoDB Connection ----------
const mongoUri = process.env.MONGO_URL;
const dbName = process.env.DB_NAME || "test_database";

mongoose.connect(mongoUri, { dbName })
  .then(() => console.log(`[Database] Connected successfully to MongoDB (${dbName})`))
  .catch((err) => console.error("[Database] Connection failed:", err));

// ---------- REST routes ----------

// Health check endpoint
app.get("/api/health", (req, res) => {
  res.json({ ok: true, app: "HomeNexus Backend", database: mongoose.connection.readyState === 1 ? "connected" : "disconnected" });
});

// Secure endpoint: Ping route for LAN Peer Discovery & profile syncing
app.post("/api/users/ping", ClerkExpressRequireAuth(), async (req, res, next) => {
  try {
    const clerkId = req.auth.userId;
    const { name, email, picture } = req.body;
    const publicIp = getClientIp(req);

    if (!name || !email) {
      return res.status(400).json({ error: "Name and Email are required parameters." });
    }

    console.log(`[Ping] Received ping from Clerk User: ${clerkId} (${name}) IP: ${publicIp}`);

    // Self-healing lookup: check if a user document exists by Clerk ID OR by Email (to link pre-existing Python database accounts)
    let userDoc = await User.findOne({
      $or: [
        { clerkId },
        { email }
      ]
    });

    if (userDoc) {
      // Update existing account details
      userDoc.clerkId = clerkId;
      userDoc.name = name;
      userDoc.email = email;
      userDoc.picture = picture || null;
      userDoc.publicIp = publicIp;
      userDoc.lastSeen = new Date();
      await userDoc.save();
    } else {
      // Create a brand new account record
      userDoc = new User({
        clerkId,
        name,
        email,
        picture: picture || null,
        publicIp,
        lastSeen: new Date()
      });
      await userDoc.save();
    }

    res.json({
      user_id: userDoc.clerkId,
      name: userDoc.name,
      email: userDoc.email,
      picture: userDoc.picture,
      publicIp: userDoc.publicIp,
      lastSeen: userDoc.lastSeen
    });
  } catch (error) {
    next(error);
  }
});

// Secure endpoint: Search users with optional Same LAN (IP) filter
app.get("/api/users", ClerkExpressRequireAuth(), async (req, res, next) => {
  try {
    const clerkId = req.auth.userId;
    const { search, sameLan } = req.query;

    const me = await User.findOne({ clerkId });
    
    // If the profile doesn't exist in MongoDB yet (race condition during login pings),
    // we bypass the same-LAN filter (or return empty peers) and prevent a 404 crash
    if (!me) {
      if (sameLan === "true") {
        return res.json([]);
      }
      let query = { clerkId: { $ne: clerkId } };
      if (search && search.trim() !== "") {
        const escapedSearch = search.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
        query.$or = [
          { name: { $regex: escapedSearch, $options: "i" } },
          { email: { $regex: escapedSearch, $options: "i" } }
        ];
      }
      const users = await User.find(query).limit(100).select("-__v");
      const mappedUsers = users.map(u => ({
        user_id: u.clerkId,
        name: u.name,
        email: u.email,
        picture: u.picture,
        publicIp: u.publicIp,
        lastSeen: u.lastSeen
      }));
      return res.json(mappedUsers);
    }

    let query = { clerkId: { $ne: clerkId } }; // Exclude myself from search results

    if (sameLan === "true") {
      if (me.publicIp) {
        query.publicIp = me.publicIp;
      } else {
        return res.json([]);
      }
    }

    if (search && search.trim() !== "") {
      const escapedSearch = search.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
      query.$or = [
        { name: { $regex: escapedSearch, $options: "i" } },
        { email: { $regex: escapedSearch, $options: "i" } }
      ];
    }

    const users = await User.find(query).limit(100).select("-__v");
    const mappedUsers = users.map(u => ({
      user_id: u.clerkId,
      name: u.name,
      email: u.email,
      picture: u.picture,
      publicIp: u.publicIp,
      lastSeen: u.lastSeen
    }));
    res.json(mappedUsers);
  } catch (error) {
    next(error);
  }
});

// Secure endpoint: Get previous conversations list (WhatsApp-style chats list)
app.get("/api/chats", ClerkExpressRequireAuth(), async (req, res, next) => {
  try {
    const clerkId = req.auth.userId;

    const chats = [
      {
        chat_id: `self:${clerkId}`,
        type: "self",
        title: "Self Chat (You)"
      },
      {
        chat_id: "public:home",
        type: "public",
        title: "Public Home Channel"
      }
    ];

    const dmMessages = await Message.aggregate([
      { 
        $match: { 
          chat_id: /^dm:/, 
          participants: clerkId 
        } 
      },
      { $sort: { created_at: -1 } },
      { 
        $group: { 
          _id: "$chat_id", 
          last_message: { $first: "$$ROOT" } 
        } 
      }
    ]);

    for (const d of dmMessages) {
      const chatId = d._id;
      const parts = chatId.split(":").slice(1);
      const otherClerkId = parts[0] === clerkId ? parts[1] : parts[0];
      const otherUser = await User.findOne({ clerkId: otherClerkId }).select("-__v");

      chats.push({
        chat_id: chatId,
        type: "dm",
        title: otherUser ? otherUser.name : "Unknown User",
        other_user: otherUser ? {
          user_id: otherUser.clerkId,
          name: otherUser.name,
          picture: otherUser.picture,
          email: otherUser.email
        } : null,
        last_message: {
          content: d.last_message.content,
          created_at: d.last_message.created_at,
          file: d.last_message.file
        }
      });
    }

    res.json(chats);
  } catch (error) {
    next(error);
  }
});

// Secure endpoint: Open or initialize a DM conversation channel
app.post("/api/chats/dm/:otherUserId", ClerkExpressRequireAuth(), async (req, res, next) => {
  try {
    const clerkId = req.auth.userId;
    const { otherUserId } = req.params;

    const other = await User.findOne({ clerkId: otherUserId }).select("-__v");
    if (!other) {
      return res.status(404).json({ error: "Recipient user not found." });
    }

    const sortedIds = [clerkId, otherUserId].sort();
    const cid = `dm:${sortedIds[0]}:${sortedIds[1]}`;

    res.json({
      chat_id: cid,
      type: "dm",
      other_user: {
        user_id: other.clerkId,
        name: other.name,
        picture: other.picture,
        email: other.email
      },
      title: other.name
    });
  } catch (error) {
    next(error);
  }
});

// Secure endpoint: Load message history for a specific chat room
app.get("/api/chats/:chatId/messages", ClerkExpressRequireAuth(), async (req, res, next) => {
  try {
    const clerkId = req.auth.userId;
    const { chatId } = req.params;
    const limit = parseInt(req.query.limit) || 100;

    if (chatId.startsWith("dm:")) {
      const parts = chatId.split(":").slice(1);
      if (!parts.includes(clerkId)) {
        return res.status(403).json({ error: "Access denied. You are not a participant in this DM." });
      }
    } else if (chatId.startsWith("self:")) {
      if (chatId.split(":")[1] !== clerkId) {
        return res.status(403).json({ error: "Access denied. Not your self-chat." });
      }
    }

    const msgs = await Message.find({ chat_id: chatId })
      .sort({ created_at: 1 })
      .limit(limit)
      .select("-__v");

    res.json(msgs);
  } catch (error) {
    next(error);
  }
});

// Secure endpoint: Post a new message inside a chat room
app.post("/api/chats/:chatId/messages", ClerkExpressRequireAuth(), async (req, res, next) => {
  try {
    const clerkId = req.auth.userId;
    const { chatId } = req.params;
    const { content, file_id, transfer_mode, client_id, file, file_meta } = req.body;

    const me = await User.findOne({ clerkId });
    if (!me) {
      return res.status(404).json({ error: "Profile not found." });
    }

    let participants = [];
    if (chatId.startsWith("dm:")) {
      const parts = chatId.split(":").slice(1);
      if (!parts.includes(clerkId)) {
        return res.status(403).json({ error: "Not a participant." });
      }
      participants = parts;
    } else if (chatId.startsWith("self:")) {
      if (chatId.split(":")[1] !== clerkId) {
        return res.status(403).json({ error: "Not your self-chat." });
      }
      participants = [clerkId];
    } else if (chatId === "public:home") {
      participants = ["__public__"];
    }

    let fileDoc = null;
    if (file) {
      fileDoc = {
        filename: file.filename,
        size: file.size,
        content_type: file.content_type || file.type,
        file_id: file_id || file.file_id || null
      };
    } else if (file_meta) {
      fileDoc = {
        filename: file_meta.filename,
        size: file_meta.size,
        content_type: file_meta.content_type || file_meta.type,
        file_id: file_id || file_meta.file_id || null
      };
    } else if (file_id) {
      // Look up file record from uploads collection for cloud fallback metadata
      const fileRecord = await File.findOne({ file_id });
      if (fileRecord) {
        fileDoc = {
          filename: fileRecord.filename,
          size: fileRecord.size,
          content_type: fileRecord.content_type,
          file_id: fileRecord.file_id
        };
      }
    }

    const msg = new Message({
      message_id: crypto.randomUUID(),
      chat_id: chatId,
      sender_id: clerkId,
      sender_name: me.name,
      sender_picture: me.picture,
      content: content || "",
      file_id: file_id || null,
      file: fileDoc,
      transfer_mode: transfer_mode || "cloud",
      client_id: client_id || null,
      participants
    });

    await msg.save();

    if (global.io) {
      const socketMsg = msg.toObject();
      const eventData = { type: "message", message: socketMsg };
      if (chatId.startsWith("dm:")) {
        participants.forEach(uid => {
          global.io.to(uid).emit("message", eventData);
        });
      } else if (chatId.startsWith("self:")) {
        global.io.to(clerkId).emit("message", eventData);
      } else if (chatId === "public:home") {
        global.io.emit("message", eventData);
      }
    }

    res.status(201).json(msg);
  } catch (error) {
    next(error);
  }
});

// Secure endpoint: Upload a file locally (Multer) for cloud fallback storage
app.post("/api/upload", ClerkExpressRequireAuth(), upload.single("file"), async (req, res, next) => {
  try {
    const clerkId = req.auth.userId;
    if (!req.file) {
      return res.status(400).json({ error: "No file provided for upload." });
    }

    const fileId = req.file.filename.split(".")[0]; // extract generated UUID
    console.log(`[Upload] File upload received from User: ${clerkId}. Filename: ${req.file.originalname} Size: ${req.file.size} bytes`);

    const fileDoc = new File({
      file_id: fileId,
      filename: req.file.originalname,
      content_type: req.file.mimetype || "application/octet-stream",
      size: req.file.size,
      storage_path: req.file.filename,
      owner_id: clerkId
    });

    await fileDoc.save();

    res.status(201).json(fileDoc);
  } catch (error) {
    next(error);
  }
});

// Authenticated endpoint: Download a cloud fallback file (supports token query param)
app.get("/api/files/:fileId/download", async (req, res, next) => {
  try {
    let token = null;
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith("Bearer ")) {
      token = authHeader.substring(7);
    } else if (req.query.auth) {
      token = req.query.auth;
    }

    if (!token) {
      return res.status(401).json({ error: "Unauthenticated. Token is missing." });
    }

    // Decode Clerk JWT synchronously
    let clerkUserId = null;
    try {
      const parts = token.split('.');
      if (parts.length === 3) {
        const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString('utf-8'));
        clerkUserId = payload.sub;
      }
    } catch (e) {
      return res.status(401).json({ error: "Invalid token." });
    }

    if (!clerkUserId) {
      return res.status(401).json({ error: "Invalid token structure." });
    }

    // Find database record
    const fileRecord = await File.findOne({ file_id: req.params.fileId });
    if (!fileRecord) {
      return res.status(404).json({ error: "File not found." });
    }

    const filePath = path.join(__dirname, "uploads", fileRecord.storage_path);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: "Physical file not found on disk." });
    }

    // Stream file stream to client
    res.setHeader("Content-Type", fileRecord.content_type);
    res.setHeader("Content-Disposition", `inline; filename="${fileRecord.filename}"`);
    res.sendFile(filePath);
  } catch (error) {
    next(error);
  }
});

// ---------- Socket.IO Real-time Engine ----------
io.on("connection", (socket) => {
  console.log(`[Socket] Connection initiated: ${socket.id}`);

  const token = socket.handshake.query.token;
  let clerkUserId = null;

  if (token) {
    try {
      const parts = token.split('.');
      if (parts.length === 3) {
        const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString('utf-8'));
        clerkUserId = payload.sub;
      }
    } catch (e) {
      console.warn("[Socket] Token extraction failed:", e.message);
    }
  }

  if (clerkUserId) {
    socket.userId = clerkUserId;
    socket.join(clerkUserId);
    console.log(`[Socket] User Acknowledged: ${clerkUserId} (Socket: ${socket.id})`);
  }

  socket.on("signal", (data) => {
    const { target_user_id, signal_type, payload, transfer_id } = data;
    if (target_user_id && socket.userId) {
      console.log(`[Socket] Signaling relay '${signal_type}' from ${socket.userId} -> ${target_user_id}`);
      io.to(target_user_id).emit("message", {
        type: "signal",
        from_user_id: socket.userId,
        signal_type,
        payload,
        transfer_id
      });
    }
  });

  socket.on("typing", (data) => {
    const { chat_id } = data;
    if (chat_id && chat_id.startsWith("dm:") && socket.userId) {
      const parts = chat_id.split(":").slice(1);
      parts.forEach(uid => {
        if (uid !== socket.userId) {
          io.to(uid).emit("message", {
            type: "typing",
            chat_id,
            from_user_id: socket.userId
          });
        }
      });
    }
  });

  socket.on("resend_request", (data) => {
    const { target_user_id, message_id, filename, chat_id, requester_name } = data;
    if (target_user_id) {
      console.log(`[Socket] Resend request for ${filename} to user ${target_user_id}`);
      io.to(target_user_id).emit("message", {
        type: "resend_request",
        target_user_id,
        message_id,
        filename,
        chat_id,
        requester_name
      });
    }
  });

  socket.on("disconnect", () => {
    console.log(`[Socket] Disconnected: ${socket.id}`);
  });
});

// ---------- Global Clerk Error Handler ----------
app.use((err, req, res, next) => {
  if (err.message && err.message.includes("Unauthenticated")) {
    console.warn(`[Auth] Rejected unauthenticated request to: ${req.method} ${req.url}`);
    return res.status(401).json({ error: "Unauthenticated. Invalid or expired token." });
  }
  console.error("[Server Error]", err);
  res.status(500).json({ error: "Internal Server Error" });
});

// ---------- Start Server ----------
server.listen(PORT, () => {
  console.log(`[Server] HomeNexus running on port ${PORT}`);
});
