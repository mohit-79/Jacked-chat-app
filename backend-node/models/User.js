const mongoose = require("mongoose");

// Mongoose schema definitions describe the structure of documents in a MongoDB collection.
const userSchema = new mongoose.Schema({
  // The unique identifier provided by Clerk (e.g., 'user_2Nabcdef...')
  clerkId: { 
    type: String, 
    required: true, 
    unique: true 
  },
  // User's email address synced from Clerk
  email: { 
    type: String, 
    required: true 
  },
  // User's display name
  name: { 
    type: String, 
    required: true 
  },
  // For backwards compatibility with legacy database accounts
  user_id: {
    type: String,
    unique: true
  },
  // URL to user's profile image / avatar
  picture: { 
    type: String, 
    default: null 
  },
  // The user's external/public IP address when online.
  // We use this to detect if two users are on the same local WiFi network (same LAN).
  publicIp: { 
    type: String, 
    default: null 
  },
  // Timestamp when the user last pinged/interacted with the server
  lastSeen: { 
    type: Date, 
    default: Date.now 
  }
}, {
  // Automatically adds 'createdAt' and 'updatedAt' fields to the document
  timestamps: true 
});

// Pre-save hook to keep clerkId and user_id in sync
userSchema.pre("save", function(next) {
  if (this.clerkId && !this.user_id) {
    this.user_id = this.clerkId;
  }
  if (this.user_id && !this.clerkId) {
    this.clerkId = this.user_id;
  }
  next();
});

// Create the model class using the schema and export it so other files can query the users collection
module.exports = mongoose.model("User", userSchema);
