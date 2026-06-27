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
const audioCtx = (() => {
  try { return new (window.AudioContext || window.webkitAudioContext)(); } catch { return null; }
})();

function playSound(type) {
  if (!audioCtx) return;
  if (audioCtx.state === "suspended") audioCtx.resume().catch(() => {});
  const ctx = audioCtx;
  const now = ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.connect(gain);
  gain.connect(ctx.destination);
  if (type === "incoming") {
    osc.type = "sine";
    osc.frequency.setValueAtTime(880, now);
    osc.frequency.setValueAtTime(1100, now + 0.08);
    gain.gain.setValueAtTime(0.18, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
    osc.start(now); osc.stop(now + 0.35);
  } else if (type === "outgoing") {
    osc.type = "sine";
    osc.frequency.setValueAtTime(660, now);
    osc.frequency.exponentialRampToValueAtTime(880, now + 0.1);
    gain.gain.setValueAtTime(0.12, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
    osc.start(now); osc.stop(now + 0.18);
  } else if (type === "newchat") {
    osc.type = "triangle";
    osc.frequency.setValueAtTime(1200, now);
    osc.frequency.exponentialRampToValueAtTime(600, now + 0.4);
    gain.gain.setValueAtTime(0.1, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
    osc.start(now); osc.stop(now + 0.4);
  }
}

// ─── Main ──────────────────────────────────────────────────────────────────
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
  const [unreadCounts, setUnreadCounts] = useState({});
  // Mobile: show sidebar or chat pane
  const [mobilePanelView, setMobilePanelView] = useState("sidebar"); // "sidebar" | "chat"

  // chatLastActivity: { [chat_id]: ISO string } — updated on every message send/receive
  // Used for WhatsApp-style ordering (most-recently-active first).
  const [chatLastActivity, setChatLastActivity] = useState({});

  const webrtcRef = useRef(null);
  const activeChatRef = useRef(null);
  const peersRef = useRef([]);
  const messagesCacheRef = useRef({});
  // Track outgoing WebRTC transfers: { [client_id]: transferId }
  const outgoingWebRTCRef = useRef({});

  activeChatRef.current = activeChat;
  peersRef.current = peers;

  // ── bump a chat to the top of the list ──
  const bumpChat = useCallback((chat_id) => {
    setChatLastActivity((prev) => ({ ...prev, [chat_id]: new Date().toISOString() }));
  }, []);

  const loadChats = useCallback(async () => {
    try {
      const res = await api.get("/chats");
      setChats(res.data);
    } catch (e) { log("loadChats failed", e?.message); }
  }, []);

  // ── WebRTC incoming file: add a synthetic "webrtc-file" message to the chat ──
  const handleIncomingWebRTCFile = useCallback(({ blob, meta, fromUserId, transferId }) => {
    const url = URL.createObjectURL(blob);
    log("webrtc file received", meta?.name, meta?.size);

    // Find which DM chat this belongs to
    // const chat = Object.values(messagesCacheRef.current).length
    //   ? null : null; // we'll match by sender

    // Build a synthetic message that looks like a server message
    const syntheticMsg = {
      message_id: `webrtc_${transferId}`,
      client_id: null,
      chat_id: null, // filled below
      sender_id: fromUserId,
      sender_name: null,
      content: "",
      file: { filename: meta?.name || "file", size: meta?.size, content_type: meta?.type, file_id: null },
      transfer_mode: "webrtc",
      created_at: new Date().toISOString(),
      _status: "received",
      _webrtcBlobUrl: url, // local URL, not cloud
      _animate: true,
    };

    // Find the active DM chat with this sender
    const activeDM = activeChatRef.current;
    const chatId = activeDM?.chat_id || null;
    if (chatId) {
      syntheticMsg.chat_id = chatId;
      // Add to active chat messages
      if (activeDM?.other_user?.user_id === fromUserId || activeDM?.type === "public") {
        setMessages((prev) => [...prev, syntheticMsg]);
        const cache = messagesCacheRef.current[chatId] || [];
        cache.push(syntheticMsg);
        messagesCacheRef.current[chatId] = cache;
        bumpChat(chatId);
      }
    }

    // Also show a toast with download option (always, as fallback)
    toast.success(`📁 Received ${meta?.name || "file"} via WebRTC`, {
      action: {
        label: "Download",
        onClick: () => {
          const a = document.createElement("a");
          a.href = url; a.download = meta?.name || "file";
          a.click();
        }
      },
      duration: 20000,
    });
  }, [bumpChat]);

  const handleWsEvent = useCallback((data) => {
    if (data.type === "message") {
      const msg = data.message;
      log("ws message", msg.chat_id, msg.message_id);

      const isActiveChat = activeChatRef.current?.chat_id === msg.chat_id;

      // Update cache
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

      // Bump chat activity for ordering
      bumpChat(msg.chat_id);

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
          if (msg.sender_id !== user?.user_id) playSound("incoming");
          return [...prev, { ...msg, _animate: true }];
        });
      } else if (msg.sender_id !== user?.user_id) {
        setUnreadCounts((prev) => ({ ...prev, [msg.chat_id]: (prev[msg.chat_id] || 0) + 1 }));
        playSound("newchat");
      }

      if (msg.chat_id.startsWith("dm:")) loadChats();

    } else if (data.type === "signal") {
      webrtcRef.current?.handleSignal(data, handleIncomingWebRTCFile);

    } else if (data.type === "resend_request") {
      // Receiver asked sender to resend a WebRTC file
      log("resend request received", data);
      toast(`📤 ${data.requester_name || "Someone"} asked you to resend "${data.filename}"`, {
        action: {
          label: "Resend",
          onClick: () => {
            toast.info("Open the file picker and attach the file to resend it.");
          }
        },
        duration: 15000,
      });

    } else if (data.type === "typing") {
      // reserved
    }
  }, [loadChats, user, bumpChat, handleIncomingWebRTCFile]);

  const { connected, send } = useWebSocket(handleWsEvent);

  useEffect(() => {
    if (!webrtcRef.current) {
      webrtcRef.current = new WebRTCTransfer({ wsSend: send, selfId: user?.user_id });
      log("webrtc initialized");
    }
  }, [send, user]);

  const loadFriends = useCallback(async () => {
    try {
      const [f, p] = await Promise.all([api.get("/friends"), api.get("/network/peers")]);
      setFriends(f.data);
      setPeers(p.data);
    } catch (e) { log("loadFriends failed", e?.message); }
  }, []);

  const loadStories = useCallback(async () => {
    try {
      const res = await api.get("/stories");
      setStories(res.data);
    } catch (e) { log("loadStories failed", e?.message); }
  }, []);

  useEffect(() => {
    loadChats();
    loadFriends();
    loadStories();
    const defaultChat = { chat_id: "public:home", type: "public", title: "Public Home Channel" };
    setActiveChat(defaultChat);
    api.get("/chats/public:home/messages").then((res) => {
      messagesCacheRef.current["public:home"] = res.data;
      setMessages(res.data);
    }).catch(() => {});
  }, [loadChats, loadFriends, loadStories]);

  const loadMessages = useCallback((chat) => {
    const cached = messagesCacheRef.current[chat.chat_id];
    if (cached && cached.length > 0) {
      setMessages(cached);
    } else {
      setMessages([]);
    }
    api.get(`/chats/${chat.chat_id}/messages`).then((res) => {
      messagesCacheRef.current[chat.chat_id] = res.data;
      if (activeChatRef.current?.chat_id === chat.chat_id) setMessages(res.data);
    }).catch((e) => log("load messages failed", e?.message));
  }, []);

  const handleSelectChat = useCallback((chat) => {
    setActiveChat(chat);
    setUnreadCounts((prev) => {
      if (!prev[chat.chat_id]) return prev;
      const next = { ...prev };
      delete next[chat.chat_id];
      return next;
    });
    loadMessages(chat);
    navigate("/app");
    setMobilePanelView("chat");
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
      setMobilePanelView("chat");
    } catch (e) { toast.error("Could not open chat"); }
  }, [loadChats, navigate, loadMessages]);

  // ── Fire-and-forget send: returns immediately, transfer runs in background ──
  // Multiple calls can be in-flight simultaneously (multi-tasking).
  const handleSendMessage = useCallback(({ content, file, preferWebRTC, onProgress, onCancelTransfer }) => {
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
      file: file ? { filename: file.name, size: file.size, content_type: file.type, file_id: null } : null,
      transfer_mode: "cloud",
      created_at: new Date().toISOString(),
      _status: "sending",
      _animate: true,
    };
    setMessages((prev) => [...prev, optimistic]);
    const cache = messagesCacheRef.current[chat.chat_id] || [];
    cache.push(optimistic);
    messagesCacheRef.current[chat.chat_id] = cache;

    playSound("outgoing");
    bumpChat(chat.chat_id);

    const patch = (updates) => {
      setMessages((prev) => prev.map((m) => m.message_id === client_id ? { ...m, ...updates } : m));
      const c = messagesCacheRef.current[chat.chat_id] || [];
      const idx = c.findIndex((m) => m.message_id === client_id);
      if (idx !== -1) c[idx] = { ...c[idx], ...updates };
    };

    // Run the actual send asynchronously so the UI is never blocked
    (async () => {
      try {
        let file_id = null;
        let transfer_mode = "cloud";
        let webrtcTransferId = null;

        if (file && preferWebRTC && chat.type === "dm" && chat.other_user) {
          const otherId = chat.other_user.user_id;
          const samePeer = peersRef.current.find((p) => p.user_id === otherId);
          if (samePeer) {
            try {
              log("webrtc transfer to", otherId);
              webrtcTransferId = await new Promise((resolve, reject) => {
                // We get transferId back from initiateSend immediately via the promise
                let capturedId = null;
                const p = webrtcRef.current.initiateSend({
                  targetUserId: otherId,
                  file,
                  onProgress: ({ percent, bytesPerSec, transferId }) => {
                    if (!capturedId && transferId) {
                      capturedId = transferId;
                      outgoingWebRTCRef.current[client_id] = transferId;
                      // Register cancel function so ChatPanel can call it
                      onCancelTransfer?.(() => {
                        webrtcRef.current?.cancelTransfer(capturedId);
                      });
                    }
                    patch({ _progress: percent, _speed: bytesPerSec, _transferId: transferId });
                    onProgress?.({ percent, bytesPerSec, mode: "webrtc" });
                  },
                  onComplete: ({ transferId }) => { transfer_mode = "webrtc"; resolve(transferId); },
                  onError: (err) => reject(err),
                  onCancel: () => {
                    delete outgoingWebRTCRef.current[client_id];
                    patch({ _status: "cancelled" });
                    reject(new Error("webrtc-cancelled"));
                  },
                });
                p.then((id) => { if (!capturedId) { capturedId = id; outgoingWebRTCRef.current[client_id] = id; } });
                setTimeout(() => reject(new Error("webrtc-timeout")), 12000);
              });

              log("webrtc complete", webrtcTransferId);
              delete outgoingWebRTCRef.current[client_id];

              // WebRTC-only: post a message record WITHOUT uploading to cloud
              // file_id stays null — receiver sees the file metadata only
              const res = await api.post(`/chats/${chat.chat_id}/messages`, {
                chat_id: chat.chat_id,
                content: content || "",
                file_id: null,
                file_meta: file ? { filename: file.name, size: file.size, content_type: file.type } : null,
                transfer_mode: "webrtc",
                client_id,
              });
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
              bumpChat(chat.chat_id);
              return; // done — skip cloud upload
            } catch (e) {
              if (e.message === "webrtc-cancelled") return; // cancelled, nothing more to do
              log("webrtc failed, falling back", e?.message);
              transfer_mode = "cloud";
            }
          }
        }

        // Cloud path
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
        bumpChat(chat.chat_id);
      } catch (e) {
        if (e.message === "webrtc-cancelled") return;
        log("send failed", e?.message);
        patch({ _status: "failed" });
        toast.error("Message failed to send");
      }
    })();

    // Return immediately — UI is not blocked
  }, [user, loadChats, bumpChat]);

  const handleRetryMessage = useCallback((clientId) => {
    setMessages((prev) => prev.filter((m) => m.message_id !== clientId));
  }, []);

  // Receiver clicks "Ask to resend" on a WebRTC file message
  const handleRequestResend = useCallback(({ originalMsg }) => {
    const chat = activeChatRef.current;
    if (!chat || !chat.other_user) return;
    // Send a WS event to the sender asking for a resend
    send({
      type: "resend_request",
      target_user_id: originalMsg.sender_id,
      message_id: originalMsg.message_id,
      filename: originalMsg.file?.filename,
      chat_id: chat.chat_id,
      requester_name: user?.name,
    });
    toast.success("Resend request sent! The sender will be notified.");
  }, [send, user]);

  // Cancel an outgoing WebRTC transfer
  const handleCancelWebRTC = useCallback((clientId) => {
    const transferId = outgoingWebRTCRef.current[clientId];
    if (transferId) {
      webrtcRef.current?.cancelTransfer(transferId);
      delete outgoingWebRTCRef.current[clientId];
    }
    setMessages((prev) => prev.map((m) =>
      m.message_id === clientId ? { ...m, _status: "cancelled" } : m
    ));
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

  // Back button on mobile: go back to sidebar
  const handleMobileBack = useCallback(() => setMobilePanelView("sidebar"), []);

  // Sort: most recently active first (WhatsApp-style). Tie-break by server last_message time.
  const sidebarChats = useMemo(() => {
    return [...chats].sort((a, b) => {
      const ta = chatLastActivity[a.chat_id] || a.last_message?.created_at || a.created_at || "";
      const tb = chatLastActivity[b.chat_id] || b.last_message?.created_at || b.created_at || "";
      return tb.localeCompare(ta);
    });
  }, [chats, chatLastActivity]);

  return (
    <div className="flex h-screen w-full bg-[#FDFBF7] overflow-hidden">
      {/* Sidebar: always visible on desktop; on mobile only when mobilePanelView==="sidebar" */}
      <div className={`
        ${mobilePanelView === "sidebar" ? "flex" : "hidden"}
        md:flex
        w-full md:w-80 lg:w-96 flex-col
        border-r-2 border-[#1A1A1A]
      `}>
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
      </div>

      {/* Chat area: always visible on desktop; on mobile only when mobilePanelView==="chat" */}
      <div className={`
        ${mobilePanelView === "chat" ? "flex" : "hidden"}
        md:flex
        flex-1 flex-col min-w-0
      `}>
        <Routes>
          <Route path="/" element={
            <ChatPanel
              user={user}
              chat={activeChat}
              messages={messages}
              peers={peers}
              onSend={handleSendMessage}
              onRetry={handleRetryMessage}
              onRequestResend={handleRequestResend}
              onCancelWebRTC={handleCancelWebRTC}
              onTyping={handleTyping}
              onMobileBack={handleMobileBack}
            />
          } />
          <Route path="/stories" element={<StoriesPage stories={stories} onChange={loadStories} />} />
          <Route path="/profile" element={<ProfilePage friends={friends} peers={peers} onChange={loadFriends} />} />
        </Routes>
      </div>

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
