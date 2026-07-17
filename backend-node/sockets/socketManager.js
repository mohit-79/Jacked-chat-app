const { Server } = require("socket.io");

let io = null;

function initSocket(server, corsOrigin) {
  io = new Server(server, {
    cors: {
      origin: corsOrigin || "http://localhost:3000",
      methods: ["GET", "POST"],
      credentials: true
    }
  });

  // Assign to global.io for backward compatibility
  global.io = io;

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

  return io;
}

function getIo() {
  return io;
}

module.exports = {
  initSocket,
  getIo
};
