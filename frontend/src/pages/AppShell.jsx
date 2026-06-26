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

// ─── Sound Engine ──────────────────────────────────────────────────────────
// Generates sounds via Web Audio API — no external files needed.
const audioCtx = (() => {
  try { return new (window.AudioContext || window.webkitAudioContext)(); } catch { return null; }
})();

function playSound(type) {
  if (!audioCtx) return;
  // Resume in case browser suspended the context before a user gesture
  if (audioCtx.state === "suspended") audioCtx.resume().catch(() => {});
  const ctx = audioCtx;
  const now = ctx.currentTime;

  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.connect(gain);
  gain.connect(ctx.destination);

  if (type === "incoming") {
    // Two-tone "ping" — pleasant notification
    osc.type = "sine";
    osc.frequency.setValueAtTime(880, now);
    osc.frequency.setValueAtTime(1100, now + 0.08);
    gain.gain.setValueAtTime(0.18, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
    osc.start(now);
    osc.stop(now + 0.35);
  } else if (type === "outgoing") {
    // Short soft "pop"
    osc.type = "sine";
    osc.frequency.setValueAtTime(660, now);
    osc.frequency.exponentialRampToValueAtTime(880, now + 0.1);
    gain.gain.setValueAtTime(0.12, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
    osc.start(now);
    osc.stop(now + 0.18);
  } else if (type === "newchat") {
    // Softer descending chime for a new DM chat arriving in sidebar
    osc.type = "triangle";
    osc.frequency.setValueAtTime(1200, now);
    osc.frequency.exponentialRampToValueAtTime(600, now + 0.4);
    gain.gain.setValueAtTime(0.1, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
    osc.start(now);
    osc.stop(now + 0.4);
  }
}

// ─── Main Component ────────────────────────────────────────────────────────
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
  // unreadCounts: { [chat_id]: number }
  const [unreadCounts, setUnreadCounts] = useState({});

  const webrtcRef = useRef(null);
  const activeChatRef = useRef(null);
  const peersRef = useRef([]);
  // Cache of messages per chat for instant switching
  const messagesCacheRef = useRef({});
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

      const isActiveChat = activeChatRef.current?.chat_id === msg.chat_id;

      // Update message cache for the chat
      messagesCacheRef.current[msg.chat_id] = messagesCacheRef.current[msg.chat_id] || [];
      const cache = messagesCacheRef.current[msg.chat_id];
      const existingCacheIdx = cache.findIndex(
        (m) => m.message_id === msg.message_id || (m.client_id && m.client_id === msg.client_id)
      );
      if (existingCacheIdx !== -1) {
        cache[existingCacheIdx] = { ...msg, _animate: false };
      } else {
        cache.push({ ...msg, _animate: !isActiveChat });
      }

      if (isActiveChat) {
        setMessages((prev) => {
          const existingIdx = prev.findIndex(
            (m) => m.message_id === msg.message_id || (m.client_id && m.client_id === msg.client_id)
          );
          if (existingIdx !== -1) {
            const next = prev.slice();
            next[existingIdx] = { ...msg, _animate: false };
            return next;
          }
          // Incoming message from someone else in current chat → play sound
          if (msg.sender_id !== user?.user_id) {
            playSound("incoming");
          }
          return [...prev, { ...msg, _animate: true }];
        });
      } else {
        // Message in a background chat → increment unread
        if (msg.sender_id !== user?.user_id) {
          setUnreadCounts((prev) => ({
            ...prev,
            [msg.chat_id]: (prev[msg.chat_id] || 0) + 1,
          }));
          playSound("newchat");
        }
      }

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
  }, [loadChats, user]);

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
    const defaultChat = { chat_id: "public:home", type: "public", title: "Public Home Channel" };
    setActiveChat(defaultChat);
    // Pre-load messages for the default chat
    api.get(`/chats/public:home/messages`).then((res) => {
      messagesCacheRef.current["public:home"] = res.data;
      setMessages(res.data);
    }).catch(() => {});
  }, [loadChats, loadFriends, loadStories]);

  // Load messages for a chat — uses cache for instant display then
  // refreshes in background to catch up on any missed messages.
  const loadMessages = useCallback((chat) => {
    const cached = messagesCacheRef.current[chat.chat_id];
    if (cached && cached.length > 0) {
      // Show cached immediately → zero perceived latency
      setMessages(cached);
    } else {
      setMessages([]);
    }
    // Always refresh from server (silently, in background)
    api.get(`/chats/${chat.chat_id}/messages`).then((res) => {
      messagesCacheRef.current[chat.chat_id] = res.data;
      // Only apply if this chat is still active
      if (activeChatRef.current?.chat_id === chat.chat_id) {
        setMessages(res.data);
      }
    }).catch((e) => log("load messages failed", e?.message));
  }, []);

  const handleSelectChat = useCallback((chat) => {
    setActiveChat(chat);
    // Clear unread for this chat
    setUnreadCounts((prev) => {
      if (!prev[chat.chat_id]) return prev;
      const next = { ...prev };
      delete next[chat.chat_id];
      return next;
    });
    loadMessages(chat);
    navigate("/app");
  }, [navigate, loadMessages]);

  const handleStartDM = useCallback(async (otherUserId) => {
    try {
      const res = await api.post(`/chats/dm/${otherUserId}`);
      const chat = res.data;
      setActiveChat(chat);
      setUnreadCounts((prev) => {
        if (!prev[chat.chat_id]) return prev;
        const next = { ...prev };
        delete next[chat.chat_id];
        return next;
      });
      loadMessages(chat);
      loadChats();
      navigate("/app");
    } catch (e) {
      toast.error("Could not open chat");
    }
  }, [loadChats, navigate, loadMessages]);

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
    // Also add to cache
    const cache = messagesCacheRef.current[chat.chat_id] || [];
    cache.push(optimistic);
    messagesCacheRef.current[chat.chat_id] = cache;

    // Play outgoing sound immediately
    playSound("outgoing");

    const patch = (updates) => {
      setMessages((prev) => prev.map((m) => (m.message_id === client_id ? { ...m, ...updates } : m)));
      const c = messagesCacheRef.current[chat.chat_id] || [];
      const idx = c.findIndex((m) => m.message_id === client_id);
      if (idx !== -1) c[idx] = { ...c[idx], ...updates };
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
      const c = messagesCacheRef.current[chat.chat_id] || [];
      const ci = c.findIndex((m) => m.message_id === client_id);
      if (ci !== -1) c[ci] = { ...res.data, client_id, _animate: false };

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

  // WebRTC file resend handler — called from ChatPanel
  const handleResendFile = useCallback(async ({ originalMsg, viaWebRTC }) => {
    const chat = activeChatRef.current;
    if (!chat) return;
    if (viaWebRTC && chat.other_user) {
      toast.info("Ask the other person to resend via WebRTC — you can't resend a received file.");
      return;
    }
    // If it's a cloud file, just open it for download
    if (originalMsg.file?.file_id) {
      const { fileDownloadUrl } = await import("@/lib/api");
      window.open(fileDownloadUrl(originalMsg.file.file_id), "_blank");
    } else {
      toast.info("File is no longer available. Ask the sender to resend it.");
    }
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

  // Sort chats: unread first, then by last message time
  const sidebarChats = useMemo(() => {
    return [...chats].sort((a, b) => {
      const ua = unreadCounts[a.chat_id] || 0;
      const ub = unreadCounts[b.chat_id] || 0;
      if (ua !== ub) return ub - ua; // unread first
      // Then by last message time descending
      const ta = a.last_message?.created_at || a.created_at || "";
      const tb = b.last_message?.created_at || b.created_at || "";
      return tb.localeCompare(ta);
    });
  }, [chats, unreadCounts]);

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
        unreadCounts={unreadCounts}
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
            onResendFile={handleResendFile}
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
