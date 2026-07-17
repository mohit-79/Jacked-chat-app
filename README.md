# HomeNexus Lite — Home Network Chat & WebRTC File Transfer 🏡🚀

**HomeNexus Lite** is a WhatsApp-like private chat application designed for home networks. It enables users on the same WiFi network to discover each other automatically and transfer files at gigabit speeds directly between their browsers using **WebRTC Data Channels**, with an Express-based cloud fallback for out-of-network transfers.

---

## 🌟 Key Features

* **Clerk Authentication**: Integrates Clerk SDK on the frontend and backend middleware to handle secure user signup, login, OAuth, and token sessions without custom database password code.
* **WebRTC Direct P2P File Transfer**: Bypasses the server entirely when sharing files with peers on the same local network, achieving maximum WiFi throughput and total privacy.
* **Cloud Upload Fallback**: Automatically uploads files to the Node.js server using `multer` when direct P2P connections fail or when communicating with out-of-network users.
* **Same-LAN Peer Discovery**: Automatically detects users sharing your public IP address. Supports searching users with a **"Same LAN only"** filter.
* **Real-time Engine**: Built on **Socket.IO** rooms to handle instant text messaging, typing alerts, and WebRTC connection signaling handshakes.
* **Chat Configurations**: Public lobby, direct messaging (DMs), and self-notes.

---

## 🛠️ The Tech Stack

* **Frontend**: React (Vite / Craco), Clerk React SDK, Socket.IO client, Axios, Tailwind CSS, Lucide icons, Sonner notifications.
* **Backend**: Node.js, Express.js, Mongoose (MongoDB ODM), Clerk Express middleware, Socket.IO server, Multer.
* **Database**: MongoDB (Atlas or Local) storing user profiles and chat message histories.

---

## 🚀 Download & Installation Guide

Follow these steps to clone the repository, install dependencies, configure credentials, and run the application locally on your machine.

### 1. Clone the Repository
Open your terminal and clone the project from GitHub, then navigate into the project root directory:
```bash
git clone https://github.com/your-username/Jacked-chat-app-main.git
cd Jacked-chat-app-main
```

---

### 2. Backend Setup (`backend-node`)

1. Navigate to the backend directory:
   ```bash
   cd backend-node
   ```
2. Install all required Node packages:
   ```bash
   npm install
   ```
3. Create a `.env` configuration file:
   ```bash
   touch .env
   ```
4. Open the `.env` file and populate it with your database and Clerk credentials:
   ```env
   PORT=8001
   MONGO_URL="your-mongodb-connection-string"
   DB_NAME="homenexus"
   CORS_ORIGIN="http://localhost:3000"

   # Clerk Authentication Keys (Get these from your Clerk dashboard: dashboard.clerk.com)
   CLERK_PUBLISHABLE_KEY=pk_test_...
   CLERK_SECRET_KEY=sk_test_...
   ```
5. Start the backend development server (runs nodemon for auto-reloading on changes):
   ```bash
   npm run dev
   ```
   *The backend will boot up on `http://localhost:8001`.*

---

### 3. Frontend Setup (`frontend`)

1. Open a new terminal window, navigate back to the project root, and enter the frontend folder:
   ```bash
   cd frontend
   ```
2. Install the frontend Node dependencies:
   ```bash
   npm install
   ```
3. Create a `.env` file for the React application:
   ```bash
   touch .env
   ```
4. Open the `.env` file and add the backend URL and your Clerk publishable key:
   ```env
   REACT_APP_BACKEND_URL=http://localhost:8001
   REACT_APP_CLERK_PUBLISHABLE_KEY=pk_test_...
   ```
5. Start the React development server:
   ```bash
   npm run dev
   ```
   *Your browser will automatically open the app at `http://localhost:3000`!*

---

## 📁 Key File Structure

```
backend-node/
  server.js             # Express app: Clerk auth routes, chats/messages REST APIs, and Socket.IO server
  models/
    User.js             # User Mongoose schema (stores Clerk profile and public IPs)
    Message.js          # Message Mongoose schema (stores chat logs in snake_case format)
    File.js             # File Mongoose schema (tracks local server-stored fallback files)
  uploads/              # Directory where cloud fallback file uploads are stored

frontend/src/
  App.js                # React Router + Clerk Provider configuration
  context/
    AuthContext.jsx     # Backward-compatible auth context adapter wrapping Clerk useUser/useAuth hooks
  lib/
    api.js              # Axios wrapper inserting Clerk Bearer JWT tokens dynamically
    websocket.js        # Socket.IO React hook wrapper handling signal/typing event relays
    webrtc.js           # P2P WebRTC data channel engine breaking down files into 256KB chunks
  components/
    Sidebar.jsx         # Conversational feed list with live LAN search filtering
    ChatPanel.jsx       # Chat window showing message threads, typing alerts, and file progress bars
  pages/
    Login.jsx           # Main landing screen containing Clerk's styled SignIn / SignUp components
    AppShell.jsx        # Dashboard orchestrator fetching previous chats and connecting real-time sockets
    ProfilePage.jsx     # Profile and local network status panel
```

---

## 💡 Developer Resources (Interview Guides)

If you are developing this application or preparing to explain it to an interviewer, we have created helpful guides inside the `hfolder` directory:

* [simple_guide.md](file:///home/harjani/Desktop/anti/Jacked-chat-app-main/hfolder/simple_guide.md): Details the simplified architecture, Clerk integration patterns, database schemas, and Socket.IO relays. Includes interview talking points.
* [todo.md](file:///home/harjani/Desktop/anti/Jacked-chat-app-main/hfolder/todo.md): Detailed migration checklists and validation tests for each phase.
* [phase_log.md](file:///home/harjani/Desktop/anti/Jacked-chat-app-main/hfolder/phase_log.md): Record of code changes, verification steps, and status updates for the build phases.
* [agents.md](file:///home/harjani/Desktop/anti/Jacked-chat-app-main/hfolder/agents.md): Rules and loops for AI agents executing phase-wise changes.
