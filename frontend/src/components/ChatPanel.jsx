import { useEffect, useRef, useState, useMemo, memo, useCallback } from "react";
import { Send, Paperclip, Zap, Cloud, Hash, User as UserIcon, FileText, Image as ImageIcon, Download, AlertCircle, RotateCcw, X } from "lucide-react";
import { fileDownloadUrl } from "@/lib/api";

function bytesPretty(n) {
  if (!n && n !== 0) return "";
  if (n < 1024) return n + " B";
  if (n < 1024 * 1024) return (n / 1024).toFixed(1) + " KB";
  if (n < 1024 * 1024 * 1024) return (n / (1024 * 1024)).toFixed(1) + " MB";
  return (n / (1024 * 1024 * 1024)).toFixed(2) + " GB";
}

function speedPretty(bytesPerSec) {
  if (!bytesPerSec || bytesPerSec <= 0) return "";
  if (bytesPerSec < 1024) return bytesPerSec.toFixed(0) + " B/s";
  if (bytesPerSec < 1024 * 1024) return (bytesPerSec / 1024).toFixed(1) + " KB/s";
  if (bytesPerSec < 1024 * 1024 * 1024) return (bytesPerSec / (1024 * 1024)).toFixed(1) + " MB/s";
  return (bytesPerSec / (1024 * 1024 * 1024)).toFixed(2) + " GB/s";
}

function formatTime(iso) {
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

// WhatsApp-style date divider label: Today / Yesterday / weekday / full date.
function dateLabel(iso) {
  const d = new Date(iso);
  const now = new Date();
  const startOfDay = (date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const diffDays = Math.round((startOfDay(now) - startOfDay(d)) / 86400000);
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays > 1 && diffDays < 7) return d.toLocaleDateString([], { weekday: "long" });
  return d.toLocaleDateString([], { day: "numeric", month: "long", year: d.getFullYear() !== now.getFullYear() ? "numeric" : undefined });
}

function sameDay(a, b) {
  const da = new Date(a), db = new Date(b);
  return da.getFullYear() === db.getFullYear() && da.getMonth() === db.getMonth() && da.getDate() === db.getDate();
}

const MessageBubble = memo(function MessageBubble({ msg, isSelf, onRetry }) {
  const file = msg.file;
  const isImage = file?.content_type?.startsWith("image/");
  const isFailed = msg._status === "failed";
  const isSending = msg._status === "sending";

  return (
    <div className={`flex ${isSelf ? "justify-end" : "justify-start"} ${msg._animate ? "bubble-in" : ""}`}>
      <div className={`max-w-[75%] ${isSelf ? "items-end" : "items-start"} flex flex-col gap-1`}>
        {!isSelf && (
          <span className="text-xs font-semibold text-[#4A4A4A] ml-1">{msg.sender_name}</span>
        )}
        <div className={`p-3 border-2 border-[#1A1A1A] rounded-2xl ${isSelf ? "bg-[#FFD3B6] rounded-tr-sm" : "bg-white rounded-tl-sm"} shadow-[3px_3px_0_#1A1A1A] ${isSending ? "opacity-70" : ""} ${isFailed ? "border-red-500" : ""}`}>
          {file && (
            <div className="mb-2">
              {isImage ? (
                <a href={file.file_id ? fileDownloadUrl(file.file_id) : undefined} target="_blank" rel="noreferrer">
                  <img src={file.file_id ? fileDownloadUrl(file.file_id) : undefined} alt={file.filename} className="rounded-lg max-h-64 border-2 border-[#1A1A1A] object-cover" />
                </a>
              ) : (
                <a
                  href={file.file_id ? fileDownloadUrl(file.file_id) : undefined}
                  target="_blank" rel="noreferrer"
                  className="flex items-center gap-3 p-2 bg-white/60 rounded-lg border border-[#1A1A1A]/30 min-w-[200px]"
                >
                  <FileText size={28} className="text-[#1A1A1A] shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-sm truncate">{file.filename}</div>
                    <div className="text-xs text-[#4A4A4A]">{bytesPretty(file.size)}</div>
                  </div>
                  {file.file_id && <Download size={16} />}
                </a>
              )}

              {isSending && msg._progress != null ? (
                <div className="mt-2">
                  <div className="h-1.5 w-full bg-white/70 border border-[#1A1A1A] rounded-full overflow-hidden">
                    <div className="h-full bg-[#1A1A1A] transition-all duration-150 ease-out" style={{ width: `${msg._progress}%` }} />
                  </div>
                  <div className="flex justify-between mt-1 text-[10px] font-semibold text-[#4A4A4A]">
                    <span>{Math.round(msg._progress)}%</span>
                    <span>{speedPretty(msg._speed)}</span>
                  </div>
                </div>
              ) : (
                <div className={`mt-1 inline-flex items-center gap-1 px-2 py-0.5 rounded-full border border-[#1A1A1A] text-[10px] font-bold ${msg.transfer_mode === "webrtc" ? "bg-[#A8E6CF]" : "bg-[#FFDFD3]"}`}>
                  {msg.transfer_mode === "webrtc" ? <Zap size={10} /> : <Cloud size={10} />}
                  {msg.transfer_mode === "webrtc" ? "ULTRA-FAST" : "CLOUD"}
                </div>
              )}
            </div>
          )}
          {msg.content && <div className="whitespace-pre-wrap break-words text-[15px]">{msg.content}</div>}
          <div className="flex items-center justify-end gap-1 mt-1">
            {isFailed && (
              <button
                onClick={() => onRetry?.(msg.message_id)}
                className="flex items-center gap-1 text-[10px] font-bold text-red-600 hover:underline"
                title="Remove failed message and try again"
              >
                <AlertCircle size={11} /> Failed <RotateCcw size={11} />
              </button>
            )}
            {isSending && !isFailed && <span className="text-[10px] text-[#4A4A4A]">Sending…</span>}
            <span className="text-[10px] text-[#4A4A4A]">{formatTime(msg.created_at)}</span>
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

export default function ChatPanel({ user, chat, messages, peers, onSend, onTyping, onRetry }) {
  const [text, setText] = useState("");
  const [file, setFile] = useState(null);
  const [sending, setSending] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(null);
  const fileInputRef = useRef(null);
  const scrollRef = useRef(null);
  const bottomRef = useRef(null);
  const wasNearBottomRef = useRef(true);

  const otherUserIsPeer = chat?.other_user && peers.some((p) => p.user_id === chat.other_user.user_id);
  const canUseWebRTC = chat?.type === "dm" && otherUserIsPeer;

  const checkNearBottom = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return true;
    const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
    return distance < 120;
  }, []);

  useEffect(() => {
    if (wasNearBottomRef.current) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
    }
  }, [messages]);

  useEffect(() => {
    wasNearBottomRef.current = true;
    bottomRef.current?.scrollIntoView({ behavior: "auto", block: "end" });
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

  if (!chat) {
    return <div className="flex-1 flex items-center justify-center bg-[#FDFBF7]"><div className="text-[#4A4A4A]">Select a chat</div></div>;
  }

  const handleSend = async (e) => {
    e?.preventDefault();
    if ((!text && !file) || sending) return;
    setSending(true);
    setUploadProgress(file ? { percent: 0, bytesPerSec: 0 } : null);
    const sentText = text;
    const sentFile = file;
    setText("");
    setFile(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
    wasNearBottomRef.current = true;
    try {
      await onSend({
        content: sentText,
        file: sentFile,
        preferWebRTC: canUseWebRTC,
        onProgress: ({ percent, bytesPerSec }) => setUploadProgress({ percent, bytesPerSec }),
      });
    } finally {
      setSending(false);
      setUploadProgress(null);
    }
  };

  return (
    <main className="flex-1 flex flex-col bg-[#FDFBF7] min-w-0">
      <div className="px-6 py-4 border-b-2 border-[#1A1A1A] bg-white flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-full border-2 border-[#1A1A1A] overflow-hidden flex items-center justify-center" style={{
            background: chat.type === "public" ? "#D4F0F0" : chat.type === "self" ? "#E8DFF5" : "#FFD3B6"
          }}>
            {chat.type === "public" ? <Hash size={20} /> : chat.type === "self" ? <UserIcon size={20} /> :
              (chat.other_user?.picture ? <img src={chat.other_user.picture} alt="" className="w-full h-full object-cover" /> : <span className="font-bold">{chat.title[0]?.toUpperCase()}</span>)
            }
          </div>
          <div>
            <div className="font-head font-black text-xl tracking-tight">{chat.title}</div>
            <div className="text-xs text-[#4A4A4A] flex items-center gap-2">
              {chat.type === "public" ? "All home members" : chat.type === "self" ? "Your private notes" : (
                <>
                  <span>Direct message</span>
                  {canUseWebRTC && <span className="inline-flex items-center gap-1 text-[#1A1A1A] font-bold"><Zap size={10} className="text-[#0F8F5F]" /> WebRTC ready</span>}
                </>
              )}
            </div>
          </div>
        </div>
        {canUseWebRTC && (
          <div className="hidden md:flex items-center gap-2 px-3 py-1.5 bg-[#A8E6CF] border-2 border-[#1A1A1A] rounded-full">
            <Zap size={14} className="text-[#1A1A1A]" />
            <span className="text-xs font-bold text-[#1A1A1A]">ULTRA-FAST READY</span>
          </div>
        )}
      </div>

      <div
        ref={scrollRef}
        onScroll={() => { wasNearBottomRef.current = checkNearBottom(); }}
        className="flex-1 overflow-y-auto p-6 space-y-3 scroll-smooth [overflow-anchor:none]"
      >
        {messages.length === 0 && (
          <div className="text-center text-[#4A4A4A] mt-12">
            <div className="text-lg font-head font-black">No messages yet</div>
            <div className="text-sm mt-1">Send the first one to get the party started</div>
          </div>
        )}
        {itemsWithDividers.map((item) =>
          item.type === "divider" ? (
            <DateDivider key={item.key} label={item.label} />
          ) : (
            <MessageBubble key={item.key} msg={item.msg} isSelf={item.msg.sender_id === user.user_id} onRetry={onRetry} />
          )
        )}
        <div ref={bottomRef} />
      </div>

      <form onSubmit={handleSend} className="p-4 border-t-2 border-[#1A1A1A] bg-white shrink-0">
        {file && (
          <div className="mb-2 flex items-center gap-3 p-2 border-2 border-[#1A1A1A] rounded-xl bg-[#FFDFD3]">
            <ImageIcon size={18} />
            <span className="text-sm flex-1 truncate">{file.name}</span>
            <span className="text-xs text-[#4A4A4A]">{bytesPretty(file.size)}</span>
            {canUseWebRTC ? (
              <span className="text-xs font-bold flex items-center gap-1 px-2 py-0.5 bg-[#A8E6CF] border border-[#1A1A1A] rounded-full"><Zap size={10} /> ULTRA-FAST</span>
            ) : (
              <span className="text-xs font-bold flex items-center gap-1 px-2 py-0.5 bg-white border border-[#1A1A1A] rounded-full"><Cloud size={10} /> CLOUD</span>
            )}
            <button type="button" onClick={() => { setFile(null); if (fileInputRef.current) fileInputRef.current.value = ""; }} className="text-xs underline">
              <X size={14} />
            </button>
          </div>
        )}
        {uploadProgress && (
          <div className="mb-2 px-1">
            <div className="h-2 w-full bg-[#FDFBF7] border-2 border-[#1A1A1A] rounded-full overflow-hidden">
              <div className="h-full bg-[#A8E6CF] transition-all duration-150 ease-out" style={{ width: `${uploadProgress.percent || 0}%` }} />
            </div>
            <div className="flex justify-between mt-1 text-[11px] font-semibold text-[#4A4A4A]">
              <span>{Math.round(uploadProgress.percent || 0)}% sent</span>
              <span>{speedPretty(uploadProgress.bytesPerSec)}</span>
            </div>
          </div>
        )}
        <div className="flex items-end gap-2">
          <input ref={fileInputRef} type="file" hidden onChange={(e) => setFile(e.target.files[0] || null)} data-testid="file-input" />
          <button type="button" data-testid="attach-file-btn" onClick={() => fileInputRef.current?.click()} className="nb-btn bg-white rounded-xl p-3"><Paperclip size={18} /></button>
          <textarea
            data-testid="message-input"
            value={text}
            onChange={(e) => { setText(e.target.value); onTyping?.(); }}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
            placeholder="Type a message..."
            rows={1}
            className="nb-input flex-1 resize-none max-h-32"
          />
          <button type="submit" disabled={sending || (!text && !file)} data-testid="send-message-btn" className="nb-btn bg-[#FFD3B6] hover:bg-[#FFC099] rounded-xl p-3 disabled:opacity-50">
            <Send size={18} />
          </button>
        </div>
      </form>
    </main>
  );
}
