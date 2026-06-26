import { useState, useRef, useEffect } from "react";
import { api, fileDownloadUrl } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import {  X, ChevronLeft, ChevronRight, Eye, Globe, Users as UsersIcon, Upload } from "lucide-react";
import StoryAvatar from "@/components/StoryAvatar";
import { toast } from "sonner";

export default function StoriesPage({ stories, onChange }) {
  const { user } = useAuth();
  const [tab, setTab] = useState("all");
  const [viewer, setViewer] = useState(null); // { userId, idx }
  const fileRef = useRef(null);

  const filtered = stories.filter(s => {
    if (tab === "friends") return s.visibility === "friends" || s.user_id === user.user_id;
    if (tab === "public") return s.visibility === "public";
    return true;
  });

  const grouped = {};
  filtered.forEach((s) => {
    if (!grouped[s.user_id]) grouped[s.user_id] = { user: { user_id: s.user_id, name: s.user_name, picture: s.user_picture }, items: [] };
    grouped[s.user_id].items.push(s);
  });
  const groupList = Object.values(grouped);

  const handleUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const visibility = window.confirm("Share with friends only? Click OK for friends, Cancel for public.") ? "friends" : "public";
    try {
      const fd = new FormData();
      fd.append("file", file);
      const up = await api.post("/upload", fd, { headers: { "Content-Type": "multipart/form-data" } });
      await api.post("/stories", { file_id: up.data.file_id, caption: "", visibility });
      toast.success("Story posted");
      onChange?.();
    } catch (err) {
      toast.error("Failed to post story");
    } finally {
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  return (
    <main className="flex-1 flex flex-col bg-[#FDFBF7] overflow-hidden">
      <div className="px-6 py-4 border-b-2 border-[#1A1A1A] bg-white flex items-center justify-between">
        <div>
          <h1 className="font-head font-black text-2xl tracking-tight">Stories</h1>
          <p className="text-xs text-[#4A4A4A]">Vanish in 24 hours</p>
        </div>
        <div className="flex gap-2">
          <button data-testid="new-story-btn" onClick={() => fileRef.current?.click()} className="nb-btn bg-[#FFD3B6] rounded-xl px-4 py-2 font-bold flex items-center gap-2"><Upload size={16} /> New story</button>
          <input ref={fileRef} type="file" accept="image/*,video/*" hidden onChange={handleUpload} data-testid="story-file-input" />
        </div>
      </div>

      <div className="px-6 py-3 border-b-2 border-[#1A1A1A] bg-white flex gap-2">
        {[
          { id: "all", label: "All", icon: null },
          { id: "friends", label: "Friends only", icon: UsersIcon },
          { id: "public", label: "Public", icon: Globe },
        ].map(t => (
          <button
            key={t.id}
            data-testid={`story-tab-${t.id}`}
            onClick={() => setTab(t.id)}
            className={`nb-btn rounded-full px-4 py-2 text-sm font-bold flex items-center gap-2 ${tab === t.id ? "bg-[#FFD3B6]" : "bg-white"}`}
          >
            {t.icon && <t.icon size={14} />} {t.label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        {groupList.length === 0 ? (
          <div className="text-center mt-20 text-[#4A4A4A]">
            <div className="font-head font-black text-3xl text-[#1A1A1A]">No stories yet</div>
            <p className="mt-2">Tap "New story" to share a moment.</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-5">
            {groupList.map((g) => (
              <button key={g.user.user_id} onClick={() => setViewer({ userId: g.user.user_id, idx: 0 })} className="flex flex-col items-center gap-2 nb-card p-4">
                <StoryAvatar name={g.user.name} picture={g.user.picture} active size={80} />
                <div className="font-semibold text-sm">{g.user.name}</div>
                <div className="text-xs text-[#4A4A4A]">{g.items.length} story{g.items.length > 1 ? "s" : ""}</div>
              </button>
            ))}
          </div>
        )}
      </div>

      {viewer && (
        <StoryViewer
          group={groupList.find(g => g.user.user_id === viewer.userId)}
          initialIdx={viewer.idx}
          onClose={() => setViewer(null)}
          currentUserId={user.user_id}
        />
      )}
    </main>
  );
}

function StoryViewer({ group, initialIdx, onClose, currentUserId }) {
  const [idx, setIdx] = useState(initialIdx);
  const story = group?.items[idx];

  useEffect(() => {
    if (!story) return;
    api.post(`/stories/${story.story_id}/view`).catch(() => {});
    const t = setTimeout(() => {
      if (idx + 1 < group.items.length) setIdx(idx + 1);
      else onClose();
    }, 5000);
    return () => clearTimeout(t);
  }, [story, idx, group, onClose]);

  if (!story) return null;
  const isImg = story.content_type?.startsWith("image/");
  const isVid = story.content_type?.startsWith("video/");

  return (
    <div className="fixed inset-0 bg-[#0F0F0F] z-50 flex items-center justify-center" data-testid="story-viewer">
      <div className="absolute top-0 left-0 right-0 p-4">
        <div className="flex gap-1 mb-3">
          {group.items.map((s, i) => (
            <div key={s.story_id} className="flex-1 h-1 bg-white/30 rounded">
              <div className={i < idx ? "h-full bg-white rounded" : i === idx ? "h-full bg-white rounded story-progress" : "h-full"} style={i > idx ? { width: 0 } : i < idx ? { width: "100%" } : {}} />
            </div>
          ))}
        </div>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-white">
            <StoryAvatar name={group.user.name} picture={group.user.picture} active size={36} />
            <div>
              <div className="font-bold text-sm">{group.user.name}</div>
              <div className="text-xs opacity-70">{story.visibility === "friends" ? "Friends only" : "Public"}</div>
            </div>
          </div>
          <button onClick={onClose} className="text-white p-2" data-testid="close-story-viewer"><X size={24} /></button>
        </div>
      </div>

      <button onClick={() => idx > 0 && setIdx(idx - 1)} className="absolute left-4 top-1/2 -translate-y-1/2 text-white p-2"><ChevronLeft size={32} /></button>
      <button onClick={() => idx + 1 < group.items.length ? setIdx(idx + 1) : onClose()} className="absolute right-4 top-1/2 -translate-y-1/2 text-white p-2"><ChevronRight size={32} /></button>

      <div className="max-h-[80vh] max-w-[90vw]">
        {isImg && <img src={fileDownloadUrl(story.file_id)} alt="" className="max-h-[80vh] max-w-[90vw] object-contain rounded-2xl border-2 border-white" />}
        {isVid && <video src={fileDownloadUrl(story.file_id)} controls autoPlay className="max-h-[80vh] max-w-[90vw] rounded-2xl border-2 border-white" />}
      </div>

      {story.user_id === currentUserId && (
        <div className="absolute bottom-6 left-0 right-0 flex justify-center">
          <div className="bg-white/10 backdrop-blur-md border border-white/30 rounded-full px-4 py-2 text-white flex items-center gap-2">
            <Eye size={14} /> <span className="text-sm">{(story.viewers || []).length} views</span>
          </div>
        </div>
      )}
    </div>
  );
}
