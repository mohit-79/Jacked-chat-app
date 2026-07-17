const express = require("express");
const crypto = require("crypto");
const { ClerkExpressRequireAuth } = require("@clerk/clerk-sdk-node");
const User = require("../models/User");
const Message = require("../models/Message");
const File = require("../models/File");

const router = express.Router();

// Secure endpoint: Get previous conversations list (WhatsApp-style chats list)
router.get("/", ClerkExpressRequireAuth(), async (req, res, next) => {
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
router.post("/dm/:otherUserId", ClerkExpressRequireAuth(), async (req, res, next) => {
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
router.get("/:chatId/messages", ClerkExpressRequireAuth(), async (req, res, next) => {
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
router.post("/:chatId/messages", ClerkExpressRequireAuth(), async (req, res, next) => {
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

module.exports = router;
