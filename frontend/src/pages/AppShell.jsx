import { useEffect, useState, useRef, useCallback, useMemo } from "react";
import { Routes, Route, useNavigate, useLocation } from "react-router-dom";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { useWebSocket } from "@/lib/websocket";
import { WebRTCTransfer } from "@/lib/webrtc";
import Sidebar from "@/components/Sidebar";
import ChatPanel from "@/components/ChatPanel";
import StoriesPage from "@/pages/StoriesPage";
import ProfilePage from "@/pages/ProfilePage";
import FriendsPanel from "@/components/FriendsPanel";
import { toast } from "sonner";

const log = (...args) => console.log("[AppShell]", ...args);

let localIdCounter = 0;
const nextLocalId = () => `local_${Date.now()}_${localIdCounter++}`;

export default function AppShell() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [chats, setChats] = useState([]);
  const [friends, setFriends] = useState([]);
  const [peers, setPeers] = useState([]);
  const [activeChat, setActiveChat] = useState(null);
  const [messages, setMessages] = useState([]);
  const [stories, setStories] = useState([]);
  const [showFriends, setShowFriends] = useState(false);

  const webrtcRef = useRef(null);
  // Kept in refs too so the WS handler (created once) always sees fresh
  // values without needing to be re-created on every chat switch — avoids
  // dropping the socket connection / signaling state on chat changes.
  const activeChatRef = useRef(null);
  const peersRef = useRef([]);
  activeChatRef.current = activeChat;
  peersRef.current = peers;

  const loadChats = useCallback(async () => {
    try {
      const res = await api.get("/chats");
      setChats(res.data);
    } catch (e) {
      log("loadChats failed", e?.message);
    }
  }, []);

  const handleWsEvent = useCallback((data) => {
    if (data.type === "message") {
      const msg = data.message;
      log("ws: message received", msg.chat_id, msg.message_id);
      setMessages((prev) => {
        if (!activeChatRef.current || msg.chat_id !== activeChatRef.current.chat_id) return prev;
        // Dedupe against the optimistic local copy (matched by client_id) and
        // against an already-applied echo (matched by message_id).
        const existingIdx = prev.findIndex(
          (m) => m.message_id === msg.message_id || (m.client_id && m.client_id === msg.client_id)
        );
        if (existingIdx !== -1) {
          const next = prev.slice();
          next[existingIdx] = { ...msg, _animate: false };
          return next;
        }
        return [...prev, { ...msg, _animate: true }];
      });
      if (msg.chat_id.startsWith("dm:")) loadChats();
    } else if (data.type === "signal") {
      webrtcRef.current?.handleSignal(data, ({ blob, meta }) => {
        const url = URL.createObjectURL(blob);
        log("webrtc: file received", meta?.name, meta?.size);
        toast.success(`Received ${meta?.name || "file"} via WebRTC`, {
          action: { label: "Download", onClick: () => {
            const a = document.createElement("a");
            a.href = url; a.download = meta?.name || "file";
            a.click();
          } },
          duration: 15000,
        });
      });
    } else if (data.type === "typing") {
      // Reserved for a future typing indicator.
    }
  }, [loadChats]);

  const { connected, send } = useWebSocket(handleWsEvent);

  useEffect(() => {
    if (!webrtcRef.current) {
      webrtcRef.current = new WebRTCTransfer({ wsSend: send, selfId: user?.user_id });
      log("webrtc transfer manager initialized");
    }
  }, [send, user]);

  const loadFriends = useCallback(async () => {
    try {
      const [f, p] = await Promise.all([api.get("/friends"), api.get("/network/peers")]);
      setFriends(f.data);
      setPeers(p.data);
    } catch (e) {
      log("loadFriends failed", e?.message);
    }
  }, []);

  const loadStories = useCallback(async () => {
    try {
      const res = await api.get("/stories");
      setStories(res.data);
    } catch (e) {
      log("loadStories failed", e?.message);
    }
  }, []);

  useEffect(() => {
    loadChats();
    loadFriends();
    loadStories();
    setActiveChat({ chat_id: "public:home", type: "public", title: "Public Home Channel" });
  }, [loadChats, loadFriends, loadStories]);

  useEffect(() => {
    if (!activeChat) return;
    let cancel = false;
    log("loading messages for", activeChat.chat_id);
    api.get(`/chats/${activeChat.chat_id}/messages`).then((res) => {
      if (!cancel) setMessages(res.data);
    }).catch((e) => log("load messages failed", e?.message));
    return () => { cancel = true; };
  }, [activeChat]);

  const handleSelectChat = useCallback((chat) => {
    setActiveChat(chat);
    navigate("/app");
  }, [navigate]);

  const handleStartDM = useCallback(async (otherUserId) => {
    try {
      const res = await api.post(`/chats/dm/${otherUserId}`);
      setActiveChat(res.data);
      loadChats();
      navigate("/app");
    } catch (e) {
      toast.error("Could not open chat");
    }
  }, [loadChats, navigate]);

  // Sends a message with full optimistic UI: it appears instantly with a
  // "sending" state, an upload progress callback streams % / speed for
  // files, and the temp message is reconciled with the server copy (or
  // rolled back with a retry affordance) once the request settles.
  const handleSendMessage = useCallback(async ({ content, file, preferWebRTC, onProgress }) => {
    const chat = activeChatRef.current;
    if (!chat) return;
    const client_id = nextLocalId();
    const optimistic = {
      message_id: client_id,
      client_id,
      chat_id: chat.chat_id,
      sender_id: user.user_id,
      sender_name: user.name,
      sender_picture: user.picture,
      content: content || "",
      file_id: null,
      file: file ? { filename: file.name, size: file.size, content_type: file.type } : null,
      transfer_mode: "cloud",
      created_at: new Date().toISOString(),
      _status: "sending",
      _animate: true,
    };
    setMessages((prev) => [...prev, optimistic]);

    const patch = (updates) => {
      setMessages((prev) => prev.map((m) => (m.message_id === client_id ? { ...m, ...updates } : m)));
    };

    try {
      let file_id = null;
      let transfer_mode = "cloud";

      if (file && preferWebRTC && chat.type === "dm" && chat.other_user) {
        const otherId = chat.other_user.user_id;
        const samePeer = peersRef.current.find((p) => p.user_id === otherId);
        if (samePeer) {
          try {
            log("attempting webrtc transfer to", otherId);
            await new Promise((resolve, reject) => {
              webrtcRef.current.initiateSend({
                targetUserId: otherId,
                file,
                onProgress: ({ percent, bytesPerSec }) => {
                  patch({ _progress: percent, _speed: bytesPerSec });
                  onProgress?.({ percent, bytesPerSec, mode: "webrtc" });
                },
                onComplete: () => { transfer_mode = "webrtc"; resolve(); },
                onError: (err) => reject(err),
              });
              setTimeout(() => reject(new Error("webrtc-timeout")), 12000);
            });
            log("webrtc transfer complete");
          } catch (e) {
            log("webrtc transfer failed, falling back to cloud", e?.message);
            transfer_mode = "cloud";
          }
        }
      }

      if (file) {
        const fd = new FormData();
        fd.append("file", file);
        const startedAt = Date.now();
        const up = await api.post("/upload", fd, {
          headers: { "Content-Type": "multipart/form-data" },
          onUploadProgress: (evt) => {
            const elapsedSec = Math.max((Date.now() - startedAt) / 1000, 0.05);
            const bytesPerSec = evt.loaded / elapsedSec;
            const percent = evt.total ? Math.round((evt.loaded / evt.total) * 100) : 0;
            patch({ _progress: percent, _speed: bytesPerSec });
            onProgress?.({ percent, bytesPerSec, loaded: evt.loaded, total: evt.total, mode: "cloud" });
          },
        });
        file_id = up.data.file_id;
        patch({ transfer_mode, _progress: 100 });
      }

      const res = await api.post(`/chats/${chat.chat_id}/messages`, {
        chat_id: chat.chat_id,
        content: content || "",
        file_id,
        transfer_mode,
        client_id,
      });
      // Reconcile optimistic message with the authoritative server copy.
      setMessages((prev) => {
        const idx = prev.findIndex((m) => m.message_id === client_id);
        if (idx === -1) return prev;
        const next = prev.slice();
        next[idx] = { ...res.data, client_id, _animate: false };
        return next;
      });
      if (chat.chat_id.startsWith("dm:")) loadChats();
    } catch (e) {
      log("send message failed", e?.message);
      patch({ _status: "failed" });
      toast.error("Message failed to send");
    }
  }, [user, loadChats]);

  const handleRetryMessage = useCallback((clientId) => {
    setMessages((prev) => prev.filter((m) => m.message_id !== clientId));
  }, []);

  const handleOpenStories = useCallback(() => navigate("/app/stories"), [navigate]);
  const handleOpenProfile = useCallback(() => navigate("/app/profile"), [navigate]);
  const handleOpenFriends = useCallback(() => setShowFriends(true), []);
  const handleCloseFriends = useCallback(() => setShowFriends(false), []);
  const handleLogout = useCallback(async () => { await logout(); navigate("/"); }, [logout, navigate]);
  const handleTyping = useCallback(() => {
    const chat = activeChatRef.current;
    if (chat?.chat_id?.startsWith("dm:")) send({ type: "typing", chat_id: chat.chat_id });
  }, [send]);

  const sidebarChats = useMemo(() => chats, [chats]);

  return (
    <div className="flex h-screen w-full bg-[#FDFBF7] overflow-hidden">
      <Sidebar
        user={user}
        chats={sidebarChats}
        peers={peers}
        friends={friends}
        stories={stories}
        activeChat={activeChat}
        onSelectChat={handleSelectChat}
        onStartDM={handleStartDM}
        onOpenStories={handleOpenStories}
        onOpenProfile={handleOpenProfile}
        onOpenFriends={handleOpenFriends}
        onLogout={handleLogout}
        connected={connected}
        currentPath={location.pathname}
      />
      <Routes>
        <Route path="/" element={
          <ChatPanel
            user={user}
            chat={activeChat}
            messages={messages}
            peers={peers}
            onSend={handleSendMessage}
            onRetry={handleRetryMessage}
            onTyping={handleTyping}
          />
        } />
        <Route path="/stories" element={<StoriesPage stories={stories} onChange={loadStories} />} />
        <Route path="/profile" element={<ProfilePage friends={friends} peers={peers} onChange={loadFriends} />} />
      </Routes>
      {showFriends && (
        <FriendsPanel
          onClose={handleCloseFriends}
          onChange={loadFriends}
          friends={friends}
          peers={peers}
        />
      )}
    </div>
  );
}
