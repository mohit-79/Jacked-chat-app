# HomeNexus Lite — Phase-Wise Implementation Todo List 📝

This document outlines the step-by-step roadmap to migrate **HomeNexus** to the simplified **HomeNexus Lite** architecture. The new stack utilizes **Node.js, Express.js, MongoDB (Mongoose), Socket.IO**, and **Clerk** for authentication, removing stories and friendship requirements.

---

## Phase 1: Backend Setup, Database Models & Clerk Integration

### 🎯 Goal
Set up the Node.js Express server, connect to MongoDB, integrate Clerk middleware for API security, and define the data schemas.

### 📁 Files to Create / Modify
* **Create** `backend-node/package.json` — Backend project file containing Node.js dependencies.
* **Create** `backend-node/.env` — Environment configurations (Clerk keys, Mongo URI, Port).
* **Create** `backend-node/server.js` — The Express app entry point.
* **Create** `backend-node/models/User.js` — Mongoose schema for User profiles.
* **Create** `backend-node/models/Message.js` — Mongoose schema for Messages.

### 🛠️ Features to Add
1. **Express & Mongoose Setup**: Standard server initialization with MongoDB connection.
2. **Clerk Express SDK Middleware**: Include `@clerk/clerk-sdk-node` to automatically intercept incoming API requests and verify the Clerk JWT session token.
3. **LAN Ping Route (`POST /api/users/ping`)**: 
   - Public route that reads the client's public IP address (`req.ip` or `x-forwarded-for`).
   - Inserts or updates the user profile details in MongoDB with their latest `publicIp` and `lastSeen` timestamp.

### 🏁 Expected Result
The backend server runs successfully on port `8001`. Securing endpoints with Clerk JWT token validation works, and user documents are updated with their public IPs in MongoDB.

### 🧪 How to Test
1. Start the server: `npm run dev`
2. Fire a curl/Postman request to `/api/users/ping` without a header and verify it returns `401 Unauthorized` (for routes wrapped in Clerk authentication).
3. Call the ping route with a valid Clerk JWT and verify MongoDB updates the user's `publicIp`.

---

## Phase 2: Frontend Clerk Integration & LAN Discovery

### 🎯 Goal
Replace the custom authentication context with Clerk on the frontend, remove deleted features (Stories/Friends), and build the user lookup search bar.

### 📁 Files to Create / Modify
* **Modify** [package.json](file:///home/harjani/Desktop/anti/Jacked-chat-app-main/frontend/package.json) — Add `@clerk/clerk-react` dependency.
* **Modify** [index.js](file:///home/harjani/Desktop/anti/Jacked-chat-app-main/frontend/src/index.js) — Wrap the app component inside Clerk's `<ClerkProvider>`.
* **Modify** [App.js](file:///home/harjani/Desktop/anti/Jacked-chat-app-main/frontend/src/App.js) — Update routes. Use Clerk's `<SignedIn>` and `<SignedOut>` components for routing.
* **Modify** [api.js](file:///home/harjani/Desktop/anti/Jacked-chat-app-main/frontend/src/lib/api.js) — Update the Axios interceptor to fetch the Clerk token:
  ```javascript
  const token = await window.Clerk.session.getToken();
  config.headers.Authorization = `Bearer ${token}`;
  ```
* **Modify** [Sidebar.jsx](file:///home/harjani/Desktop/anti/Jacked-chat-app-main/frontend/src/components/Sidebar.jsx) — Remove stories row. Add search bar input with a **"Same LAN only"** checkbox.
* **Remove / Deregister** these files (delete or disable React routes):
  - `frontend/src/pages/StoriesPage.jsx`
  - `frontend/src/components/FriendsPanel.jsx`
  - `frontend/src/components/StoryAvatar.jsx`
  - `frontend/src/context/AuthContext.jsx` *(replaced by Clerk hooks)*

### 🛠️ Features to Add
1. **Clerk Authentication Panels**: Login page replaces local forms with Clerk's `<SignIn />` and `<SignUp />` components.
2. **LAN Search API (`GET /api/users`)**: Express endpoint that searches users by name. If the query parameter `sameLan=true` is sent, it filters the database query to return only users sharing the current user's `publicIp`.

### 🏁 Expected Result
The React frontend starts up. Users log in through Clerk. The dashboard shows a cleaner sidebar with no friend/stories tabs and a working search input with a "Same LAN only" toggle.

### 🧪 How to Test
1. Log in via Clerk.
2. Search for a user in the search bar. Toggle the "Same LAN only" switch. 
3. Inspect network requests in DevTools: verify `/api/users?search=name&sameLan=true` is called and returns only matching peers.

---

## Phase 3: Real-Time Chat & Socket.IO Signaling

### 🎯 Goal
Implement real-time messaging and relay WebRTC signals using Socket.IO on both backend and frontend.

### 📁 Files to Create / Modify
* **Modify** `backend-node/server.js` — Import Socket.IO. Set up connection middleware that authenticates the Socket.IO connection using the Clerk token.
* **Modify** [websocket.js](file:///home/harjani/Desktop/anti/Jacked-chat-app-main/frontend/src/lib/websocket.js) — Rewrite the hook to import `socket.io-client` instead of using the raw WebSocket constructor.
* **Modify** [AppShell.jsx](file:///home/harjani/Desktop/anti/Jacked-chat-app-main/frontend/src/pages/AppShell.jsx) — Integrate the updated socket hook. Rewrite the message hooks to fetch from the Node backend.
* **Create / Implement** backend chat history routes:
  - `GET /api/chats` — Aggregates unique users the logged-in user has exchanged messages with (retrieves previous conversations list).
  - `GET /api/chats/:chatId/messages` — Retrieves message history from MongoDB.
  - `POST /api/chats/:chatId/messages` — Inserts a message and broadcasts it.

### 🛠️ Features to Add
1. **Socket.IO Relaying Engine**:
   - On socket connection: Bind socket ID to user's Clerk ID (`socket.join(clerkId)`).
   - On event `"typing"`: Broadcast typing status to target DM user's room.
   - On event `"signal"`: Relay WebRTC SDP offers/answers/ICE candidates directly to the target user's Clerk ID room.
2. **Previous Chats Aggregation**: Fetch conversation lists ordered by the latest message.

### 🏁 Expected Result
Text messages appear on both screens instantly when sent. Typings show up, and background Socket.IO relays the WebRTC negotiation payloads between peer browsers.

### 🧪 How to Test
1. Open two private windows. Log in as User A and User B.
2. Search and select the other user.
3. Start typing (verify typing status displays on the other screen).
4. Send a text message and verify it appears instantly without page reloads. Verify it saved to the MongoDB `messages` collection.

---

## Phase 4: WebRTC Data Channel Files & Cloud Fallback

### 🎯 Goal
Refactor the file attachment mechanism to support both direct WebRTC chunking over Socket.IO and cloud file upload fallback.

### 📁 Files to Create / Modify
* **Modify** [webrtc.js](file:///home/harjani/Desktop/anti/Jacked-chat-app-main/frontend/src/lib/webrtc.js) — Update signallers to emit `socket.emit("signal", ...)` instead of custom WebSocket actions.
* **Modify** [ChatPanel.jsx](file:///home/harjani/Desktop/anti/Jacked-chat-app-main/frontend/src/components/ChatPanel.jsx) — Attach file input handlers, WebRTC progress bars, and cancel signals.
* **Modify** `backend-node/server.js` — Implement:
  - `POST /api/upload` — Upload files using `multer`. Files can be saved to local disk or MongoDB GridFS as cloud fallback.
  - `GET /api/files/:fileId/download` — Download files uploaded in cloud fallback mode.

### 🛠️ Features to Add
1. **Socket.IO-Relayed WebRTC file pipeline**: Hands over signaling metadata to establish direct connection.
2. **Buffered Flow Control**: Monitors `bufferedAmount` to throttle data transfers to prevent browser buffer overflow.
3. **Cloud Fallback Endpoint**: Saves files to the server when WebRTC connection times out (e.g. after 10 seconds).

### 🏁 Expected Result
Files transferred between same-network clients bypass the server completely and transfer at maximum local speed. Out-of-network files successfully upload to the Express server and display download links.

### 🧪 How to Test
1. Connect User A and User B on the same network (verified by same public IP).
2. Attach a file in the chat panel. Verify a green **"WebRTC"** badge is displayed.
3. Send the file. Verify that a progress bar reaches 100%, and the recipient receives the file without any file uploading to MongoDB.
4. Block WebRTC (or test between different IP simulation). Verify it automatically uploads via `POST /api/upload` (cloud fallback) and recipient can successfully download it via the HTTP link.

---

## Phase 5: App Renaming to HomeNexus

### 🎯 Goal
Rename all instances and references of "HomeNexus Lite" back to the original brand name "HomeNexus" in user interfaces, server logs, and package configurations.

### 📁 Files to Create / Modify
* **Modify** `backend-node/package.json` — Update name from `homenexus-backend-node` to `homenexus-backend`.
* **Modify** `backend-node/server.js` — Update health check and console messages.
* **Modify** [package.json](file:///home/harjani/Desktop/anti/Jacked-chat-app-main/frontend/package.json) — Update name to `homenexus`.
* **Modify** [Login.jsx](file:///home/harjani/Desktop/anti/Jacked-chat-app-main/frontend/src/pages/Login.jsx) — Rename header visual text to "HomeNexus".
* **Modify** [Sidebar.jsx](file:///home/harjani/Desktop/anti/Jacked-chat-app-main/frontend/src/components/Sidebar.jsx) — Rename header text to "HomeNexus".
* **Modify** [README.md](file:///home/harjani/Desktop/anti/Jacked-chat-app-main/README.md) — Re-brand title and occurrences to "HomeNexus".

### 🛠️ Features to Add
1. Consolidated branding: Make sure there are no remaining "Lite" markers anywhere.

### 🏁 Expected Result
The UI components and backend server run under the name "HomeNexus".

### 🧪 How to Test
1. Compile and run both servers.
2. Verify that the login page and chat sidebar display "HomeNexus".

---

## Phase 6: Upgrade to Official Clerk React SDK (@clerk/react)

### 🎯 Goal
Remove the deprecated `@clerk/clerk-react` package and upgrade the frontend application to use the official, supported `@clerk/react` package.

### 📁 Files to Create / Modify
* **Modify** [package.json](file:///home/harjani/Desktop/anti/Jacked-chat-app-main/frontend/package.json) — Remove `@clerk/clerk-react` and add `@clerk/react`.
* **Modify** [index.js](file:///home/harjani/Desktop/anti/Jacked-chat-app-main/frontend/src/index.js) — Update `ClerkProvider` import.
* **Modify** [AuthContext.jsx](file:///home/harjani/Desktop/anti/Jacked-chat-app-main/frontend/src/context/AuthContext.jsx) — Update `useUser` and `useAuth` imports.
* **Modify** [Login.jsx](file:///home/harjani/Desktop/anti/Jacked-chat-app-main/frontend/src/pages/Login.jsx) — Update `SignIn` and `SignUp` component imports.

### 🛠️ Features to Add
1. **SDK Upgrade**: Uninstall the legacy package and configure the project to use `@clerk/react`.
2. **Import Updates**: Update all references in frontend code to import from `@clerk/react` instead of `@clerk/clerk-react`.

### 🏁 Expected Result
The React frontend successfully installs and builds with `@clerk/react` with no deprecation warning or compile errors.

### 🧪 How to Test
1. Run `npm uninstall @clerk/clerk-react && npm install @clerk/react` in `frontend/`.
2. Build the project: `npm run build` and ensure compilation completes successfully.

