import { useEffect, useRef, useState, useMemo, memo, useCallback } from "react";
import {
  Send, Paperclip, Zap, Cloud, Hash, User as UserIcon,
  FileText, Image as ImageIcon, AlertCircle, RotateCcw, X,
  RefreshCw, Clock, Check, CheckCheck, ArrowLeft, XCircle
} from "lucide-react";
import { fileDownloadUrl } from "@/lib/api";

// ─── Helpers ────────────────────────────────────────────────────────────────
function bytesPretty(n) {
  if (!n && n !== 0) return "";
  if (n < 1024) return n + " B";
  if (n < 1024 * 1024) return (n / 1024).toFixed(1) + " KB";
  if (n < 1024 * 1024 * 1024) return (n / (1024 * 1024)).toFixed(1) + " MB";
  return (n / (1024 * 1024 * 1024)).toFixed(2) + " GB";
}

function speedPretty(b) {
  if (!b || b <= 0) return "";
  if (b < 1024) return b.toFixed(0) + " B/s";
  if (b < 1048576) return (b / 1024).toFixed(1) + " KB/s";
  if (b < 1073741824) return (b / 1048576).toFixed(1) + " MB/s";
  return (b / 1073741824).toFixed(2) + " GB/s";
}

function formatTime(iso) {
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function dateLabel(iso) {
  const d = new Date(iso), now = new Date();
  const sod = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate());
  const diff = Math.round((sod(now) - sod(d)) / 86400000);
  if (diff === 0) return "Today";
  if (diff === 1) return "Yesterday";
  if (diff < 7) return d.toLocaleDateString([], { weekday: "long" });
  return d.toLocaleDateString([], { day: "numeric", month: "long", year: d.getFullYear() !== now.getFullYear() ? "numeric" : undefined });
}

function sameDay(a, b) {
  const da = new Date(a), db = new Date(b);
  return da.getFullYear() === db.getFullYear() && da.getMonth() === db.getMonth() && da.getDate() === db.getDate();
}

// ─── Message status tick ────────────────────────────────────────────────────
// pending/unsent → clock icon
// sending → clock
// sent (server confirmed, not received) → single grey tick
// received → double grey tick
// read → double blue ticks
// failed → red
// cancelled → strikethrough
function MessageTick({ msg, isSelf }) {
  if (!isSelf) return null;
  const status = msg._status;
  const read = msg._read;

  if (status === "cancelled") {
    return <span className="text-[10px] text-[#4A4A4A] italic">cancelled</span>;
  }
  if (status === "failed") {
    return <AlertCircle size={11} className="text-red-500" />;
  }
  if (status === "sending" || status === "pending") {
    return <Clock size={11} className="text-[#4A4A4A]" />;
  }
  // Sent (confirmed by server)
  if (read === "read") {
    // Double blue ticks
    return (
      <span className="flex items-center">
        <CheckCheck size={13} className="text-blue-500" />
      </span>
    );
  }
  if (read === "received") {
    // Double grey ticks
    return <CheckCheck size={13} className="text-[#4A4A4A]" />;
  }
  // Sent, not yet received — single grey tick
  return <Check size={11} className="text-[#4A4A4A]" />;
}

// ─── WebRTC-only file bubble (receiver side) ────────────────────────────────
function WebRTCReceivedFile({ msg, onRequestResend }) {
  const [asked, setAsked] = useState(false);
  const blobUrl = msg._webrtcBlobUrl;
  const isImage = msg.file?.content_type?.startsWith("image/");

  return (
    <div className="rounded-xl border-2 border-dashed border-[#1A1A1A]/40 overflow-hidden bg-white/60">
      {/* If we have a local blob URL (same session), show it */}
      {blobUrl && isImage ? (
        <a href={blobUrl} target="_blank" rel="noreferrer">
          <img src={blobUrl} alt={msg.file?.filename} className="max-h-48 w-full object-cover rounded-lg border-b-2 border-[#1A1A1A]/20" />
        </a>
      ) : (
        <div className="flex items-center gap-3 p-3">
          <div className="w-10 h-10 rounded-lg bg-[#A8E6CF]/40 border-2 border-[#1A1A1A]/30 flex items-center justify-center shrink-0">
            <Zap size={18} className="text-[#0F8F5F]" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-semibold text-sm truncate">{msg.file?.filename || "File"}</div>
            <div className="text-xs text-[#4A4A4A]">{bytesPretty(msg.file?.size)}</div>
          </div>
          {blobUrl && (
            <a href={blobUrl} download={msg.file?.filename}
              className="shrink-0 px-2 py-1 bg-[#A8E6CF] border border-[#1A1A1A] rounded-lg text-[11px] font-bold">
              Save
            </a>
          )}
        </div>
      )}
      <div className="px-3 pb-2 flex items-center justify-between">
        <span className="text-[10px] font-bold text-[#0F8F5F] flex items-center gap-1">
          <Zap size={9} /> Sent via WebRTC {!blobUrl && "· not in cloud"}
        </span>
        {!asked ? (
          <button
            onClick={() => { setAsked(true); onRequestResend?.({ originalMsg: msg }); }}
            className="flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 bg-[#FFDFD3] border border-[#1A1A1A] rounded-full hover:bg-[#FFD3B6]"
          >
            <RefreshCw size={9} /> Ask to resend
          </button>
        ) : (
          <span className="text-[10px] text-[#4A4A4A] italic">Request sent ✓</span>
        )}
      </div>
    </div>
  );
}

// ─── Cloud file display (with download link) ────────────────────────────────
function CloudFile({ file }) {
  const isImage = file?.content_type?.startsWith("image/");
  const url = file?.file_id ? fileDownloadUrl(file.file_id) : null;
  if (isImage && url) {
    return (
      <a href={url} target="_blank" rel="noreferrer">
        <img src={url} alt={file.filename} className="rounded-lg max-h-64 border-2 border-[#1A1A1A] object-cover w-full" />
      </a>
    );
  }
  return (
    <a href={url || undefined} target="_blank" rel="noreferrer"
      className={`flex items-center gap-3 p-2 bg-white/60 rounded-lg border border-[#1A1A1A]/30 min-w-[200px] ${!url ? "pointer-events-none opacity-60" : ""}`}>
      <FileText size={28} className="text-[#1A1A1A] shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="font-semibold text-sm truncate">{file?.filename}</div>
        <div className="text-xs text-[#4A4A4A]">{bytesPretty(file?.size)}</div>
      </div>
    </a>
  );
}

// ─── Sending file preview (in-progress) ────────────────────────────────────
function SendingFilePreview({ msg, onCancel }) {
  const isImage = msg.file?.content_type?.startsWith("image/");
  const progress = msg._progress ?? 0;
  const isCancelled = msg._status === "cancelled";

  return (
    <div className="rounded-lg border-2 border-[#1A1A1A]/30 overflow-hidden bg-white/60">
      <div className="flex items-center gap-3 p-2">
        {isImage
          ? <ImageIcon size={28} className="text-[#1A1A1A] shrink-0" />
          : <FileText size={28} className="text-[#1A1A1A] shrink-0" />
        }
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-sm truncate">{msg.file?.filename}</div>
          <div className="text-xs text-[#4A4A4A]">{bytesPretty(msg.file?.size)}</div>
        </div>
        {!isCancelled && onCancel && (
          <button onClick={() => onCancel(msg.message_id)}
            className="shrink-0 p-1 rounded-full hover:bg-red-100"
            title="Cancel transfer">
            <XCircle size={16} className="text-red-500" />
          </button>
        )}
      </div>
      {!isCancelled && (
        <div className="px-2 pb-2">
          <div className="h-1.5 w-full bg-white/70 border border-[#1A1A1A]/20 rounded-full overflow-hidden">
            <div className="h-full bg-[#A8E6CF] transition-all duration-150 ease-out" style={{ width: `${progress}%` }} />
          </div>
          <div className="flex justify-between mt-0.5 text-[10px] font-semibold text-[#4A4A4A]">
            <span>{Math.round(progress)}%</span>
            <span>{speedPretty(msg._speed)}</span>
          </div>
        </div>
      )}
      {isCancelled && <div className="px-2 pb-2 text-[11px] text-red-500 font-semibold">Transfer cancelled</div>}
    </div>
  );
}

// ─── Single message bubble ──────────────────────────────────────────────────
const MessageBubble = memo(function MessageBubble({ msg, isSelf, onRetry, onRequestResend, onCancelWebRTC }) {
  const file = msg.file;
  const isFailed = msg._status === "failed";
  const isSending = msg._status === "sending";
  const isCancelled = msg._status === "cancelled";
  const isWebRTCFile = msg.transfer_mode === "webrtc" && !msg._status?.includes("send"); // received webrtc
  const hasCloudFile = !!file?.file_id;

  // Determine which file UI to show
  let fileContent = null;
  if (file) {
    if (isSending || isCancelled) {
      // In-progress or cancelled outgoing transfer
      fileContent = <SendingFilePreview msg={msg} onCancel={isSelf && isSending ? onCancelWebRTC : null} />;
    } else if (!isSelf && msg.transfer_mode === "webrtc") {
      // Receiver side of a WebRTC transfer (no cloud copy)
      fileContent = <WebRTCReceivedFile msg={msg} onRequestResend={onRequestResend} />;
    } else if (hasCloudFile || (isSelf && msg.transfer_mode === "webrtc" && !isSending)) {
      // Cloud file (either party), or sender's record of completed WebRTC
      if (hasCloudFile) {
        fileContent = <CloudFile file={file} />;
      } else {
        // Sender's view of their own WebRTC file — just show metadata, no resend option
        fileContent = (
          <div className="flex items-center gap-3 p-2 bg-[#A8E6CF]/30 rounded-lg border border-[#1A1A1A]/20 min-w-[200px]">
            <Zap size={24} className="text-[#0F8F5F] shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="font-semibold text-sm truncate">{file.filename}</div>
              <div className="text-xs text-[#4A4A4A]">{bytesPretty(file.size)}</div>
            </div>
            <span className="text-[10px] font-bold text-[#0F8F5F] flex items-center gap-0.5 shrink-0">
              <Zap size={9} />ULTRA-FAST
            </span>
          </div>
        );
      }
    }
  }

  return (
    <div className={`flex ${isSelf ? "justify-end" : "justify-start"} ${msg._animate ? "bubble-in" : ""}`}>
      <div className={`max-w-[75%] ${isSelf ? "items-end" : "items-start"} flex flex-col gap-0.5`}>
        {!isSelf && (
          <span className="text-xs font-semibold text-[#4A4A4A] ml-1">{msg.sender_name}</span>
        )}
        <div className={`
          p-3 border-2 border-[#1A1A1A] rounded-2xl shadow-[3px_3px_0_#1A1A1A]
          ${isSelf ? "bg-[#FFD3B6] rounded-tr-sm" : "bg-white rounded-tl-sm"}
          ${isSending ? "opacity-80" : ""}
          ${isFailed ? "border-red-500" : ""}
          ${isCancelled ? "opacity-50" : ""}
        `}>
          {fileContent && <div className="mb-2">{fileContent}</div>}
          {msg.content && (
            <div className="whitespace-pre-wrap break-words text-[15px]">{msg.content}</div>
          )}
          {/* Footer row: fail/retry, time, ticks */}
          <div className="flex items-center justify-end gap-1.5 mt-1 min-h-[14px]">
            {isFailed && (
              <button onClick={() => onRetry?.(msg.message_id)}
                className="flex items-center gap-1 text-[10px] font-bold text-red-600 hover:underline">
                <AlertCircle size={11} /> Retry <RotateCcw size={10} />
              </button>
            )}
            <span className="text-[10px] text-[#4A4A4A]">{formatTime(msg.created_at)}</span>
            <MessageTick msg={msg} isSelf={isSelf} />
          </div>
        </div>
      </div>
    </div>
  );
});

function DateDivider({ label }) {
  return (
    <div className="flex items-center justify-center my-2">
      <span className="px-3 py-1 text-[11px] font-bold bg-white border-2 border-[#1A1A1A] rounded-full text-[#4A4A4A] shadow-[2px_2px_0_#1A1A1A]">
        {label}
      </span>
    </div>
  );
}

// ─── Main ChatPanel ─────────────────────────────────────────────────────────
export default function ChatPanel({
  user, chat, messages, peers,
  onSend, onTyping, onRetry, onRequestResend, onCancelWebRTC, onMobileBack
}) {
  const [text, setText] = useState("");
  const [file, setFile] = useState(null);
  // Each ongoing transfer gets its own progress entry keyed by client_id
  const [transferProgress, setTransferProgress] = useState({});
  const fileInputRef = useRef(null);
  const scrollRef = useRef(null);
  const bottomRef = useRef(null);
  const wasNearBottomRef = useRef(true);
  const prevChatIdRef = useRef(null);

  const otherUserIsPeer = chat?.other_user && peers.some((p) => p.user_id === chat.other_user.user_id);
  const canUseWebRTC = chat?.type === "dm" && otherUserIsPeer;

  const checkNearBottom = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return true;
    return el.scrollHeight - el.scrollTop - el.clientHeight < 120;
  }, []);

  useEffect(() => {
    if (wasNearBottomRef.current) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
    }
  }, [messages]);

  useEffect(() => {
    if (chat?.chat_id !== prevChatIdRef.current) {
      prevChatIdRef.current = chat?.chat_id;
      wasNearBottomRef.current = true;
      requestAnimationFrame(() => {
        bottomRef.current?.scrollIntoView({ behavior: "auto", block: "end" });
      });
    }
  }, [chat?.chat_id]);

  const itemsWithDividers = useMemo(() => {
    const out = [];
    let lastDate = null;
    for (const m of messages) {
      if (!lastDate || !sameDay(lastDate, m.created_at)) {
        out.push({ type: "divider", key: `div-${m.created_at}`, label: dateLabel(m.created_at) });
        lastDate = m.created_at;
      }
      out.push({ type: "message", key: m.message_id, msg: m });
    }
    return out;
  }, [messages]);

  // Active file transfers — must be declared before any early return (Rules of Hooks)
  const activeTransfers = useMemo(
    () => messages.filter((m) => m._status === "sending" && m.file && m.sender_id === user?.user_id),
    [messages, user]
  );

  if (!chat) {
    return (
      <div className="flex-1 flex items-center justify-center bg-[#FDFBF7]">
        <div className="text-center text-[#4A4A4A]">
          <div className="text-2xl mb-2">💬</div>
          <div className="font-semibold">Select a chat to start messaging</div>
        </div>
      </div>
    );
  }

  const handleSend = (e) => {
    e?.preventDefault();
    if (!text && !file) return;

    const sentText = text;
    const sentFile = file;
    setText("");
    setFile(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
    wasNearBottomRef.current = true;

    // Fire-and-forget: does NOT await, so UI is never blocked
    // Multiple sends can be in-flight simultaneously
    onSend({
      content: sentText,
      file: sentFile,
      preferWebRTC: canUseWebRTC,
      onProgress: ({ percent, bytesPerSec }) => {
        // Progress is handled inside the optimistic message patch in AppShell
        // Nothing extra needed here
      },
    });
  };

  return (
    <main className="flex-1 flex flex-col bg-[#FDFBF7] min-w-0 h-full">
      {/* Header */}
      <div className="px-4 md:px-6 py-4 border-b-2 border-[#1A1A1A] bg-white flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          {/* Mobile back button */}
          <button
            onClick={onMobileBack}
            className="md:hidden p-1 rounded-lg hover:bg-[#FDFBF7] -ml-1"
            aria-label="Back to chats"
          >
            <ArrowLeft size={22} />
          </button>
          <div className="w-10 h-10 md:w-11 md:h-11 rounded-full border-2 border-[#1A1A1A] overflow-hidden flex items-center justify-center shrink-0" style={{
            background: chat.type === "public" ? "#D4F0F0" : chat.type === "self" ? "#E8DFF5" : "#FFD3B6"
          }}>
            {chat.type === "public" ? <Hash size={18} /> : chat.type === "self" ? <UserIcon size={18} /> :
              (chat.other_user?.picture
                ? <img src={chat.other_user.picture} alt="" className="w-full h-full object-cover" />
                : <span className="font-bold text-sm">{chat.title[0]?.toUpperCase()}</span>)
            }
          </div>
          <div>
            <div className="font-head font-black text-lg md:text-xl tracking-tight leading-tight">{chat.title}</div>
            <div className="text-xs text-[#4A4A4A] flex items-center gap-2">
              {chat.type === "public" ? "All home members" : chat.type === "self" ? "Your private notes" : (
                <>
                  <span>Direct message</span>
                  {canUseWebRTC && (
                    <span className="inline-flex items-center gap-0.5 text-[#0F8F5F] font-bold">
                      <Zap size={9} /> WebRTC ready
                    </span>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
        {canUseWebRTC && (
          <div className="hidden md:flex items-center gap-2 px-3 py-1.5 bg-[#A8E6CF] border-2 border-[#1A1A1A] rounded-full">
            <Zap size={13} /><span className="text-xs font-bold">ULTRA-FAST</span>
          </div>
        )}
      </div>

      {/* Messages */}
      <div
        ref={scrollRef}
        onScroll={() => { wasNearBottomRef.current = checkNearBottom(); }}
        className="flex-1 overflow-y-auto p-4 md:p-6 space-y-2 [overflow-anchor:none]"
      >
        {messages.length === 0 && (
          <div className="text-center text-[#4A4A4A] mt-12">
            <div className="text-lg font-head font-black">No messages yet</div>
            <div className="text-sm mt-1">Send the first one!</div>
          </div>
        )}
        {itemsWithDividers.map((item) =>
          item.type === "divider"
            ? <DateDivider key={item.key} label={item.label} />
            : <MessageBubble
                key={item.key}
                msg={item.msg}
                isSelf={item.msg.sender_id === user?.user_id}
                onRetry={onRetry}
                onRequestResend={onRequestResend}
                onCancelWebRTC={onCancelWebRTC}
              />
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input area */}
      <div className="p-3 md:p-4 border-t-2 border-[#1A1A1A] bg-white shrink-0">
        {/* Pending file preview */}
        {file && (
          <div className="mb-2 flex items-center gap-3 p-2 border-2 border-[#1A1A1A] rounded-xl bg-[#FFDFD3]">
            <ImageIcon size={16} />
            <span className="text-sm flex-1 truncate">{file.name}</span>
            <span className="text-xs text-[#4A4A4A]">{bytesPretty(file.size)}</span>
            {canUseWebRTC
              ? <span className="text-[10px] font-bold flex items-center gap-0.5 px-2 py-0.5 bg-[#A8E6CF] border border-[#1A1A1A] rounded-full"><Zap size={9} /> WebRTC</span>
              : <span className="text-[10px] font-bold flex items-center gap-0.5 px-2 py-0.5 bg-white border border-[#1A1A1A] rounded-full"><Cloud size={9} /> Cloud</span>
            }
            <button type="button" onClick={() => { setFile(null); if (fileInputRef.current) fileInputRef.current.value = ""; }}>
              <X size={14} />
            </button>
          </div>
        )}

        <div className="flex items-end gap-2">
          <input ref={fileInputRef} type="file" hidden onChange={(e) => setFile(e.target.files[0] || null)} data-testid="file-input" />
          <button type="button" data-testid="attach-file-btn" onClick={() => fileInputRef.current?.click()}
            className="nb-btn bg-white rounded-xl p-2.5 md:p-3 shrink-0">
            <Paperclip size={18} />
          </button>
          <textarea
            data-testid="message-input"
            value={text}
            onChange={(e) => { setText(e.target.value); onTyping?.(); }}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
            placeholder="Type a message..."
            rows={1}
            className="nb-input flex-1 resize-none max-h-32 text-[15px]"
          />
          <button
            onClick={handleSend}
            disabled={!text && !file}
            data-testid="send-message-btn"
            className="nb-btn bg-[#FFD3B6] hover:bg-[#FFC099] rounded-xl p-2.5 md:p-3 disabled:opacity-50 shrink-0"
          >
            <Send size={18} />
          </button>
        </div>
      </div>
    </main>
  );
}
