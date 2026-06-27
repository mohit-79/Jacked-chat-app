import { Home, Hash, User as UserIcon, LogOut, Users, Wifi, WifiOff, Search, Plus } from "lucide-react";
import { useState, useMemo, memo } from "react";
import StoryAvatar from "@/components/StoryAvatar";

function Sidebar({
  user, chats, peers, friends, stories, activeChat,
  onSelectChat, onStartDM, onOpenStories, onOpenProfile, onOpenFriends,
  onLogout, connected, currentPath, unreadCounts = {}
}) {
  const [search, setSearch] = useState("");

  const storyUsersList = useMemo(() => {
    const myStoryUsers = Array.from(new Set(stories.map((s) => s.user_id)));
    return myStoryUsers.map((uid) => {
      const ss = stories.filter((s) => s.user_id === uid);
      return { user_id: uid, name: ss[0].user_name, picture: ss[0].user_picture, count: ss.length };
    });
  }, [stories]);

  const filteredChats = useMemo(
    () => chats.filter((c) => c.title.toLowerCase().includes(search.toLowerCase())),
    [chats, search]
  );
  const filteredPeers = useMemo(
    () => peers.filter((p) => p.name.toLowerCase().includes(search.toLowerCase())),
    [peers, search]
  );

  return (
    // Full width on mobile; fixed width on desktop — sizing is controlled by the
    // wrapper div in AppShell (w-full md:w-80 lg:w-96)
    <div className="flex flex-col bg-white h-full w-full">
      {/* Header */}
      <div className="p-4 border-b-2 border-[#1A1A1A] flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-10 h-10 bg-[#FFD3B6] border-2 border-[#1A1A1A] shadow-[3px_3px_0_#1A1A1A] rounded-xl flex items-center justify-center">
            <Home size={18} className="text-[#1A1A1A]" strokeWidth={2.5} />
          </div>
          <span className="font-head font-black text-xl tracking-tight">HomeNexus</span>
        </div>
        <div className="flex items-center gap-2">
          <button data-testid="open-profile-btn" onClick={onOpenProfile}
            className="w-9 h-9 rounded-full border-2 border-[#1A1A1A] overflow-hidden bg-[#E8DFF5]">
            {user?.picture
              ? <img src={user.picture} alt="" className="w-full h-full object-cover" />
              : <div className="w-full h-full flex items-center justify-center font-bold text-sm">
                  {(user?.name || "?")[0]?.toUpperCase()}
                </div>
            }
          </button>
        </div>
      </div>

      {/* Stories row */}
      <div className="px-3 py-3 border-b-2 border-[#1A1A1A] flex items-center gap-3 overflow-x-auto shrink-0">
        <button data-testid="open-stories-btn" onClick={onOpenStories} className="flex flex-col items-center gap-1 shrink-0">
          <div className="w-14 h-14 rounded-full border-2 border-dashed border-[#1A1A1A] bg-[#FFDFD3] flex items-center justify-center">
            <Plus size={20} className="text-[#1A1A1A]" />
          </div>
          <span className="text-xs font-semibold">Your story</span>
        </button>
        {storyUsersList.map((su) => (
          <button key={su.user_id} onClick={onOpenStories} className="flex flex-col items-center gap-1 shrink-0">
            <StoryAvatar name={su.name} picture={su.picture} active />
            <span className="text-xs font-semibold max-w-[60px] truncate">{su.name}</span>
          </button>
        ))}
      </div>

      {/* Network status */}
      <div className="px-4 py-2 border-b-2 border-[#1A1A1A] bg-[#FDFBF7] flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          {connected
            ? <Wifi size={15} className="text-[#1A1A1A]" />
            : <WifiOff size={15} className="text-[#1A1A1A]" />
          }
          <span className="text-sm font-semibold">
            {peers.length > 0 ? `${peers.length} on home network` : "Home Network"}
          </span>
          {peers.length > 0 && <span className="w-2 h-2 rounded-full bg-[#A8E6CF] pulse-dot" />}
        </div>
        <button data-testid="open-friends-btn" onClick={onOpenFriends}
          className="text-xs font-bold underline underline-offset-2">Friends</button>
      </div>

      {/* Search */}
      <div className="p-3 border-b-2 border-[#1A1A1A] shrink-0">
        <div className="relative">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#4A4A4A]" />
          <input
            data-testid="chat-search-input"
            type="text"
            placeholder="Search chats & peers"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="nb-input pl-9 text-sm"
          />
        </div>
      </div>

      {/* Chat list */}
      <div className="flex-1 overflow-y-auto">
        {filteredChats.map((c) => {
          const unread = unreadCounts[c.chat_id] || 0;
          const isActive = activeChat?.chat_id === c.chat_id && currentPath === "/app";
          return (
            <button
              key={c.chat_id}
              data-testid={`chat-item-${c.chat_id}`}
              onClick={() => onSelectChat(c)}
              className={`w-full text-left px-4 py-3 flex items-center gap-3 border-b border-[#1A1A1A]/10 transition-colors duration-100 ${
                isActive ? "bg-[#FFDFD3]" : unread > 0 ? "bg-[#FFF8F5]" : "hover:bg-[#FDFBF7]"
              }`}
            >
              {/* Avatar + unread badge */}
              <div className="relative shrink-0">
                <div className="w-12 h-12 rounded-full border-2 border-[#1A1A1A] overflow-hidden flex items-center justify-center" style={{
                  background: c.type === "public" ? "#D4F0F0" : c.type === "self" ? "#E8DFF5" : "#FFD3B6"
                }}>
                  {c.type === "public" ? <Hash size={18} />
                    : c.type === "self" ? <UserIcon size={18} />
                    : (c.other_user?.picture
                        ? <img src={c.other_user.picture} alt="" className="w-full h-full object-cover" />
                        : <span className="font-bold text-sm">{c.title[0]?.toUpperCase()}</span>)
                  }
                </div>
                {unread > 0 && (
                  <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 bg-[#FF6B6B] border-2 border-white rounded-full flex items-center justify-center text-[10px] font-black text-white leading-none">
                    {unread > 99 ? "99+" : unread}
                  </span>
                )}
              </div>

              {/* Name + preview */}
              <div className="flex-1 min-w-0">
                <div className={`truncate text-[15px] ${unread > 0 ? "font-black" : "font-semibold"}`}>
                  {c.title}
                </div>
                <div className={`text-xs truncate mt-0.5 ${unread > 0 ? "text-[#1A1A1A] font-semibold" : "text-[#4A4A4A]"}`}>
                  {c.type === "public"
                    ? "Everyone's hangout"
                    : c.type === "self"
                    ? "Notes & files just for you"
                    : (c.last_message?.content || (c.last_message?.file ? "📎 File" : "Tap to chat"))}
                </div>
              </div>

              {/* Unread dot */}
              {unread > 0 && !isActive && (
                <span className="w-2.5 h-2.5 rounded-full bg-[#FF6B6B] shrink-0" />
              )}
            </button>
          );
        })}

        {/* Network peers */}
        {filteredPeers.length > 0 && (
          <div className="px-4 py-3 border-t-2 border-[#1A1A1A]">
            <div className="text-xs font-bold uppercase tracking-wider text-[#4A4A4A] mb-2 flex items-center gap-2">
              <Users size={13} /> On your network
            </div>
            {filteredPeers.map((p) => (
              <button
                key={p.user_id}
                data-testid={`peer-item-${p.user_id}`}
                onClick={() => onStartDM(p.user_id)}
                className="w-full text-left px-2 py-2.5 flex items-center gap-3 rounded-lg hover:bg-[#FDFBF7]"
              >
                <div className="w-10 h-10 rounded-full border-2 border-[#1A1A1A] overflow-hidden bg-[#FFD3B6] flex items-center justify-center shrink-0">
                  {p.picture
                    ? <img src={p.picture} alt="" className="w-full h-full object-cover" />
                    : <span className="font-bold text-sm">{p.name[0]?.toUpperCase()}</span>
                  }
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-sm truncate">{p.name}</div>
                  <div className="text-xs text-[#1A1A1A] flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-[#A8E6CF] pulse-dot" /> ultra-fast ready
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="p-3 border-t-2 border-[#1A1A1A] flex items-center justify-between bg-[#FDFBF7] shrink-0">
        <div className="text-xs min-w-0">
          <div className="font-bold truncate">{user?.name}</div>
          <div className="text-[#4A4A4A] truncate max-w-[180px]">{user?.email}</div>
        </div>
        <button data-testid="logout-btn" onClick={onLogout} className="nb-btn bg-white rounded-lg p-2 shrink-0 ml-2">
          <LogOut size={16} />
        </button>
      </div>
    </div>
  );
}

export default memo(Sidebar);
