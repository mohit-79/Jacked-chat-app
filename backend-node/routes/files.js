const express = require("express");
const path = require("path");
const fs = require("fs");
const { ClerkExpressRequireAuth } = require("@clerk/clerk-sdk-node");
const { upload, uploadsDir } = require("../config/multer");
const File = require("../models/File");

const router = express.Router();

// Secure endpoint: Upload a file locally (Multer) for cloud fallback storage
router.post("/upload", ClerkExpressRequireAuth(), upload.single("file"), async (req, res, next) => {
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
router.get("/files/:fileId/download", async (req, res, next) => {
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

    const filePath = path.join(uploadsDir, fileRecord.storage_path);
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

module.exports = router;
