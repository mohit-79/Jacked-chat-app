import { Home, Hash, User as UserIcon, LogOut, Users, Wifi, WifiOff, Search } from "lucide-react";
import { useState, useEffect, useMemo, memo } from "react";
import { api } from "@/lib/api";

function Sidebar({
  user, chats, peers, activeChat,
  onSelectChat, onStartDM, onOpenProfile,
  onLogout, connected, currentPath, unreadCounts = {}
}) {
  const [search, setSearch] = useState("");
  const [sameLanOnly, setSameLanOnly] = useState(false);
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);

  // Debounced live user search query
  useEffect(() => {
    if (!search.trim()) {
      setSearchResults([]);
      return;
    }
    const delayDebounce = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await api.get("/users", {
          params: { search, sameLan: sameLanOnly }
        });
        setSearchResults(res.data);
      } catch (err) {
        console.warn("[Sidebar] User search failed:", err.message);
      } finally {
        setSearching(false);
      }
    }, 400); // 400ms debounce delay

    return () => clearTimeout(delayDebounce);
  }, [search, sameLanOnly]);

  const filteredChats = useMemo(
    () => chats.filter((c) => c.title.toLowerCase().includes(search.toLowerCase())),
    [chats, search]
  );

  return (
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
      </div>

      {/* Search Input & LAN filter */}
      <div className="p-3 border-b-2 border-[#1A1A1A] shrink-0 space-y-2">
        <div className="relative">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#4A4A4A]" />
          <input
            data-testid="chat-search-input"
            type="text"
            placeholder="Search chats & new users..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="nb-input pl-9 text-sm"
          />
        </div>
        <div className="flex items-center gap-2 px-1">
          <input
            id="lan-filter"
            type="checkbox"
            checked={sameLanOnly}
            onChange={(e) => setSameLanOnly(e.target.checked)}
            className="rounded border-[#1A1A1A] text-[#FFD3B6] focus:ring-0 focus:ring-offset-0 cursor-pointer"
          />
          <label htmlFor="lan-filter" className="text-xs font-semibold text-[#4A4A4A] select-none cursor-pointer">
            Filter by Same LAN / WiFi
          </label>
        </div>
      </div>

      {/* Main List Area */}
      <div className="flex-1 overflow-y-auto">
        {/* If user is typing in search, show global search results first */}
        {search.trim().length > 0 ? (
          <div className="px-4 py-3">
            <div className="text-xs font-bold uppercase tracking-wider text-[#4A4A4A] mb-2">
              Search Results {searching && "..."}
            </div>
            {searchResults.length === 0 && !searching && (
              <div className="text-sm text-[#4A4A4A] italic px-1 py-2">No users found.</div>
            )}
            <div className="space-y-1">
              {searchResults.map((su) => (
                <button
                  key={su.user_id} // Align key with user_id returned from user search API
                  onClick={() => {
                    onStartDM(su.user_id); // Start DM using user_id instead of undefined clerkId
                    setSearch("");
                  }}
                  className="w-full text-left p-2 flex items-center gap-3 rounded-lg border border-[#1A1A1A]/10 hover:bg-[#FDFBF7] transition-all"
                >
                  <div className="w-10 h-10 rounded-full border-2 border-[#1A1A1A] overflow-hidden bg-[#FFD3B6] flex items-center justify-center shrink-0">
                    {su.picture ? (
                      <img src={su.picture} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <span className="font-bold text-sm">{su.name[0]?.toUpperCase()}</span>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-sm truncate">{su.name}</div>
                    <div className="text-xs text-[#4A4A4A] truncate">{su.email}</div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        ) : (
          /* Normal Chat History list */
          <div className="divide-y divide-[#1A1A1A]/10">
            {filteredChats.length === 0 ? (
              <div className="text-center text-[#4A4A4A] text-sm mt-8 px-4">
                No active conversations.<br />Search a name to start chatting!
              </div>
            ) : (
              filteredChats.map((c) => {
                const unread = unreadCounts[c.chat_id] || 0;
                const isActive = activeChat?.chat_id === c.chat_id && currentPath === "/app";
                return (
                  <button
                    key={c.chat_id}
                    data-testid={`chat-item-${c.chat_id}`}
                    onClick={() => onSelectChat(c)}
                    className={`w-full text-left px-4 py-3 flex items-center gap-3 transition-colors duration-100 ${
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
              })
            )}

            {/* Same network peers list (static convenience view when not searching) */}
            {peers.length > 0 && (
              <div className="px-4 py-3 border-t-2 border-[#1A1A1A]">
                <div className="text-xs font-bold uppercase tracking-wider text-[#4A4A4A] mb-2 flex items-center gap-2">
                  <Users size={13} /> On your LAN network
                </div>
                <div className="space-y-1">
                  {peers.map((p) => (
                    <button
                      key={p.user_id} // Align key with user_id returned from LAN discovery api
                      onClick={() => onStartDM(p.user_id)} // Start DM using user_id instead of undefined clerkId
                      className="w-full text-left p-2 flex items-center gap-3 rounded-lg hover:bg-[#FDFBF7] transition-all"
                    >
                      <div className="w-10 h-10 rounded-full border-2 border-[#1A1A1A] overflow-hidden bg-[#FFD3B6] flex items-center justify-center shrink-0">
                        {p.picture ? (
                          <img src={p.picture} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <span className="font-bold text-sm">{p.name[0]?.toUpperCase()}</span>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-semibold text-sm truncate">{p.name}</div>
                        <div className="text-xs text-[#0F8F5F] flex items-center gap-1 font-bold">
                          <span className="w-2 h-2 rounded-full bg-[#A8E6CF] pulse-dot" /> LAN Ready
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}
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
