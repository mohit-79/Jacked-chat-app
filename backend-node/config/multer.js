const path = require("path");
const fs = require("fs");
const multer = require("multer");
const crypto = require("crypto");

const uploadsDir = path.join(__dirname, "..", "uploads");
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir);
}

// Memory storage is used to store files in MongoDB Atlas,
// surviving ephemeral server rebuilds on Render.
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: { fileSize: 15 * 1024 * 1024 } // limit to 15MB to stay within MongoDB 16MB document limit
});

module.exports = {
  upload,
  uploadsDir
};
