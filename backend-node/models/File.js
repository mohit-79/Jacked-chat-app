const mongoose = require("mongoose");

// Mongoose schema for Cloud Fallback File uploads.
const fileSchema = new mongoose.Schema({
  // Unique UUID generated on upload
  file_id: { 
    type: String, 
    required: true, 
    unique: true 
  },
  // The original name of the file
  filename: { 
    type: String, 
    required: true 
  },
  // MIME type (e.g. 'image/png', 'application/pdf')
  content_type: { 
    type: String, 
    default: "application/octet-stream" 
  },
  // File size in bytes
  size: { 
    type: Number, 
    required: true 
  },
  // Local path or filename where the file is stored on the server's disk
  storage_path: { 
    type: String, 
    required: true 
  },
  // Clerk ID of the user who uploaded the file
  owner_id: { 
    type: String, 
    required: true 
  }
}, {
  // Configures Mongoose to add timestamps using snake_case names
  timestamps: { 
    createdAt: "created_at", 
    updatedAt: "updated_at" 
  }
});

module.exports = mongoose.model("File", fileSchema);
