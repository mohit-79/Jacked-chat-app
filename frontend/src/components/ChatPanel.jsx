import { useEffect, useRef, useState, useMemo, memo, useCallback } from "react";
import { Send, Paperclip, Zap, Cloud, Hash, User as UserIcon, FileText, Image as ImageIcon, Download, AlertCircle, RotateCcw, X, RefreshCw } from "lucide-react";
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

// WebRTC file bubble — shows a placeholder with resend option
function WebRTCFileBubble({ msg, isSelf, onResendFile }) {
  const [showMenu, setShowMenu] = useState(false);
  // A WebRTC-transferred file that has no cloud file_id
  const wasWebRTC = msg.transfer_mode === "webrtc";
  const hasCloudCopy = !!msg.file?.file_id;

  return (
    <div
      className="relative flex items-center gap-3 p-3 bg-white/60 rounded-xl border-2 border-dashed border-[#1A1A1A]/40 min-w-[200px] cursor-pointer select-none"
      onClick={() => setShowMenu((v) => !v)}
    >
      <div className="w-10 h-10 rounded-lg bg-[#A8E6CF]/40 border-2 border-[#1A1A1A]/30 flex items-center justify-center shrink-0">
        {wasWebRTC ? <Zap size={18} className="text-[#0F8F5F]" /> : <FileText size={18} className="text-[#1A1A1A]" />}
      </div>
      <div className="flex-1 min-w-0">
        <div className="font-semibold text-sm truncate">{msg.file?.filename || "File"}</div>
        <div className="text-xs text-[#4A4A4A]">{bytesPretty(msg.file?.size)}</div>
        <div className="text-[10px] font-bold text-[#4A4A4A] flex items-center gap-1 mt-0.5">
          {wasWebRTC && !hasCloudCopy ? (
            <><Zap size={9} className="text-[#0F8F5F]" /> Sent via WebRTC (tap to options)</>
          ) : (
            <><Cloud size={9} /> Cloud</>
          )}
        </div>
      </div>

      {showMenu && (
        <div className="absolute bottom-full left-0 mb-2 z-50 bg-white border-2 border-[#1A1A1A] rounded-xl shadow-[4px_4px_0_#1A1A1A] overflow-hidden min-w-[200px]">
          {hasCloudCopy && (
            <a
              href={fileDownloadUrl(msg.file.file_id)}
              target="_blank"
              rel="noreferrer"
              onClick={(e) => { e.stopPropagation(); setShowMenu(false); }}
              className="flex items-center gap-3 px-4 py-3 hover:bg-[#FFDFD3] text-sm font-semibold border-b border-[#1A1A1A]/10"
            >
              <Download size={14} /> Download file
            </a>
          )}
          {wasWebRTC && !hasCloudCopy && (
            <div className="px-4 py-2 text-[11px] text-[#4A4A4A] border-b border-[#1A1A1A]/10">
              WebRTC files aren't stored in the cloud.
            </div>
          )}
          <button
            onClick={(e) => { e.stopPropagation(); setShowMenu(false); onResendFile?.({ originalMsg: msg, viaWebRTC: false }); }}
            className="w-full flex items-center gap-3 px-4 py-3 hover:bg-[#FFDFD3] text-sm font-semibold border-b border-[#1A1A1A]/10"
          >
            <RefreshCw size={14} /> Ask to resend via Cloud
          </button>
          {isSelf === false && (
            <button
              onClick={(e) => { e.stopPropagation(); setShowMenu(false); onResendFile?.({ originalMsg: msg, viaWebRTC: true }); }}
              className="w-full flex items-center gap-3 px-4 py-3 hover:bg-[#A8E6CF]/40 text-sm font-semibold"
            >
              <Zap size={14} /> Ask to resend via WebRTC
            </button>
          )}
          <button
            onClick={(e) => { e.stopPropagation(); setShowMenu(false); }}
            className="w-full flex items-center gap-3 px-4 py-3 hover:bg-[#FDFBF7] text-sm text-[#4A4A4A]"
          >
            <X size={14} /> Close
          </button>
        </div>
      )}
    </div>
  );
}

const MessageBubble = memo(function MessageBubble({ msg, isSelf, onRetry, onResendFile }) {
  const file = msg.file;
  const isImage = file?.content_type?.startsWith("image/");
  const isFailed = msg._status === "failed";
  const isSending = msg._status === "sending";
  // A file message that came over WebRTC (no cloud file_id) or any file
  const isFileMsg = !!file;
  const needsResendUI = isFileMsg && !isSending;

  return (
    <div className={`flex ${isSelf ? "justify-end" : "justify-start"} ${msg._animate ? "bubble-in" : ""}`}>
      <div className={`max-w-[75%] ${isSelf ? "items-end" : "items-start"} flex flex-col gap-1`}>
        {!isSelf && (
          <span className="text-xs font-semibold text-[#4A4A4A] ml-1">{msg.sender_name}</span>
        )}
        <div className={`p-3 border-2 border-[#1A1A1A] rounded-2xl ${isSelf ? "bg-[#FFD3B6] rounded-tr-sm" : "bg-white rounded-tl-sm"} shadow-[3px_3px_0_#1A1A1A] ${isSending ? "opacity-70" : ""} ${isFailed ? "border-red-500" : ""}`}>
          {file && (
            <div className="mb-2">
              {isSending ? (
                // While sending, show a simple preview
                isImage ? (
                  <div className="rounded-lg max-h-64 border-2 border-[#1A1A1A] bg-[#FDFBF7] flex items-center justify-center w-48 h-32">
                    <ImageIcon size={32} className="text-[#4A4A4A]" />
                  </div>
                ) : (
                  <div className="flex items-center gap-3 p-2 bg-white/60 rounded-lg border border-[#1A1A1A]/30 min-w-[200px]">
                    <FileText size={28} className="text-[#1A1A1A] shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-sm truncate">{file.filename}</div>
                      <div className="text-xs text-[#4A4A4A]">{bytesPretty(file.size)}</div>
                    </div>
                  </div>
                )
              ) : isImage && file.file_id ? (
                <a href={fileDownloadUrl(file.file_id)} target="_blank" rel="noreferrer">
                  <img src={fileDownloadUrl(file.file_id)} alt={file.filename} className="rounded-lg max-h-64 border-2 border-[#1A1A1A] object-cover" />
                </a>
              ) : (
                // All non-sending files use the WebRTC bubble with resend menu
                <WebRTCFileBubble msg={msg} isSelf={isSelf} onResendFile={onResendFile} />
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
              ) : !isSending && (
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

export default function ChatPanel({ user, chat, messages, peers, onSend, onTyping, onRetry, onResendFile }) {
  const [text, setText] = useState("");
  const [file, setFile] = useState(null);
  const [sending, setSending] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(null);
  const fileInputRef = useRef(null);
  const scrollRef = useRef(null);
  const bottomRef = useRef(null);
  const wasNearBottomRef = useRef(true);
  // Track previous chat_id to detect chat switch
  const prevChatIdRef = useRef(null);

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

  // On chat switch: instant scroll to bottom without animation
  useEffect(() => {
    if (chat?.chat_id !== prevChatIdRef.current) {
      prevChatIdRef.current = chat?.chat_id;
      wasNearBottomRef.current = true;
      // Use requestAnimationFrame so DOM has updated
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
      {/* Chat header — renders immediately from `chat` prop, no loading state */}
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
        className="flex-1 overflow-y-auto p-6 space-y-3 [overflow-anchor:none]"
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
            <MessageBubble key={item.key} msg={item.msg} isSelf={item.msg.sender_id === user.user_id} onRetry={onRetry} onResendFile={onResendFile} />
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
