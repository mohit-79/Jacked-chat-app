const express = require("express");
const { ClerkExpressRequireAuth } = require("@clerk/clerk-sdk-node");
const User = require("../models/User");
const { getClientIp } = require("../utils/ip");

const router = express.Router();

// Secure endpoint: Ping route for LAN Peer Discovery & profile syncing
router.post("/ping", ClerkExpressRequireAuth(), async (req, res, next) => {
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
router.get("/", ClerkExpressRequireAuth(), async (req, res, next) => {
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

module.exports = router;
