# HomeNexus — Home Network Chat & File Transfer

A WhatsApp-like chat app for home networks with ultra-fast WebRTC file transfer.

## Features
- **Google OAuth + JWT auth** (email/password)
- **WebRTC ultra-fast file transfer** for same-network peers (auto-detected by public IP or home group code)
- **Cloud fallback** via Emergent object storage
- **Chats**: Public channel, self-chat (notes), direct messages
- **Real-time** via WebSocket (auto-reconnect)
- **Stories**: 24h expiry, friends-only or public, viewer counts
- **Friend requests** system
- **Profile page** with avatar upload, bio, home group code

## Setup

### Backend
```bash
cd backend
pip install -r requirements.txt
# Set variables in .env (MONGO_URL, DB_NAME, JWT_SECRET, EMERGENT_LLM_KEY, APP_NAME)
uvicorn server:app --reload --port 8001
```

### Frontend
```bash
cd frontend
npm install
# Set REACT_APP_BACKEND_URL in .env
npm start
```

## Structure
```
backend/
  server.py          # FastAPI: auth, chats, files, stories, WebSocket + WebRTC signaling
  requirements.txt

frontend/src/
  App.js                      # Router + AuthProvider
  context/AuthContext.jsx     # Auth state (JWT + Google OAuth)
  lib/api.js                  # Axios instance
  lib/websocket.js            # WebSocket hook (auto-reconnect)
  lib/webrtc.js               # WebRTC P2P file transfer
  pages/
    Login.jsx                 # Google + email/password login
    AppShell.jsx              # Main layout orchestrator
    ProfilePage.jsx           # Profile + friends list
    StoriesPage.jsx           # 24h stories feed + viewer
    AuthCallback.jsx          # OAuth callback handler
  components/
    Sidebar.jsx               # Chat list, peers, stories row
    ChatPanel.jsx             # Messages + file upload
    FriendsPanel.jsx          # Find friends, accept requests
    StoryAvatar.jsx           # Gradient ring avatar
    ui/sonner.jsx             # Toast notification wrapper
```
