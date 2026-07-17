const mongoose = require("mongoose");

// Mongoose schema for Chat Messages (Direct Messages, Self-Chats, and Public Channel).
// We use snake_case field names (e.g. chat_id, created_at) to match the existing
// React frontend structures, allowing the frontend to run with minimal rewrites.
const messageSchema = new mongoose.Schema({
  // Unique UUID generated on the client or server
  message_id: { 
    type: String, 
    required: true, 
    unique: true 
  },
  // The identifier for the chat room:
  // - Public Channel: 'public:home'
  // - Self-Chat: 'self:clerkUserId'
  // - Direct Message: 'dm:userIdA:userIdB' (sorted alphabetically)
  chat_id: { 
    type: String, 
    required: true 
  },
  // Clerk ID of the sender
  sender_id: { 
    type: String, 
    required: true 
  },
  // Display name of the sender
  sender_name: { 
    type: String, 
    required: true 
  },
  // URL to the sender's avatar
  sender_picture: { 
    type: String, 
    default: null 
  },
  // Text message content
  content: { 
    type: String, 
    default: "" 
  },
  // Storage ID for cloud upload fallback transfers
  file_id: { 
    type: String, 
    default: null 
  },
  // Nested file metadata block
  file: {
    filename: String,
    size: Number,
    content_type: String,
    file_id: String
  },
  // The transfer protocol used for files: 'webrtc' or 'cloud'
  transfer_mode: { 
    type: String, 
    enum: ["webrtc", "cloud"], 
    default: "cloud" 
  },
  // Echoed ID from the client to help with optimistic UI rendering
  client_id: { 
    type: String, 
    default: null 
  },
  // Array of Clerk IDs participating in this chat (e.g. both users in a DM, or ["__public__"])
  participants: [{ 
    type: String 
  }]
}, {
  // Configures Mongoose to add timestamps using custom snake_case names
  timestamps: { 
    createdAt: "created_at", 
    updatedAt: "updated_at" 
  }
});

// Index message searches on chat room and message dates for quick sorting
messageSchema.index({ chat_id: 1, created_at: 1 });

module.exports = mongoose.model("Message", messageSchema);
