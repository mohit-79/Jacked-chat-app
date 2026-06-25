import { useEffect, useState, useMemo } from "react";
import { api } from "@/lib/api";
import { X, UserPlus, Check } from "lucide-react";
import { toast } from "sonner";

export default function FriendsPanel({ onClose, onChange, friends, peers }) {
  const [users, setUsers] = useState([]);
  const [requests, setRequests] = useState([]);
  const [sentTo, setSentTo] = useState(() => new Set());

  useEffect(() => {
    api.get("/users").then((r) => setUsers(r.data)).catch((e) => console.warn("[Friends] load users failed", e?.message));
    api.get("/friends/requests").then((r) => setRequests(r.data)).catch((e) => console.warn("[Friends] load requests failed", e?.message));
  }, []);

  const friendIds = useMemo(() => new Set(friends.map((f) => f.user_id)), [friends]);

  const sendReq = async (uid) => {
    try {
      await api.post("/friends/request", { user_id: uid });
      setSentTo((prev) => new Set(prev).add(uid));
      toast.success("Friend request sent");
    } catch (e) {
      console.warn("[Friends] send request failed", e?.message);
      toast.error("Failed");
    }
  };

  const respond = async (rid, accept) => {
    await api.post("/friends/respond", { request_id: rid, accept });
    setRequests(requests.filter(r => r.request_id !== rid));
    onChange?.();
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-40 flex items-end md:items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white border-2 border-[#1A1A1A] shadow-[6px_6px_0_#1A1A1A] rounded-2xl w-full max-w-2xl max-h-[80vh] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="p-4 border-b-2 border-[#1A1A1A] flex items-center justify-between">
          <h2 className="font-head font-black text-2xl tracking-tight">Find friends</h2>
          <button data-testid="close-friends-panel" onClick={onClose} className="p-2"><X size={20} /></button>
        </div>
        <div className="overflow-y-auto flex-1">
          {requests.length > 0 && (
            <div className="p-4 border-b-2 border-[#1A1A1A]">
              <div className="text-xs font-bold uppercase tracking-wider text-[#4A4A4A] mb-2">Pending requests ({requests.length})</div>
              <ul className="space-y-2">
                {requests.map(r => (
                  <li key={r.request_id} className="flex items-center gap-3 p-2 border-2 border-[#1A1A1A] rounded-lg">
                    <div className="w-9 h-9 rounded-full border-2 border-[#1A1A1A] overflow-hidden bg-[#FFD3B6] flex items-center justify-center">
                      {r.from_user_info?.picture ? <img src={r.from_user_info.picture} alt="" className="w-full h-full object-cover" /> : <span className="font-bold">{r.from_user_info?.name?.[0]?.toUpperCase()}</span>}
                    </div>
                    <div className="flex-1">
                      <div className="font-semibold text-sm">{r.from_user_info?.name}</div>
                    </div>
                    <button onClick={() => respond(r.request_id, true)} className="nb-btn bg-[#A8E6CF] rounded-lg px-3 py-1 text-xs font-bold">Accept</button>
                    <button onClick={() => respond(r.request_id, false)} className="nb-btn bg-white rounded-lg px-3 py-1 text-xs font-bold">Decline</button>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div className="p-4">
            <div className="text-xs font-bold uppercase tracking-wider text-[#4A4A4A] mb-2">All registered users</div>
            <ul className="space-y-2">
              {users.map(u => {
                const isFriend = friendIds.has(u.user_id);
                const isPeer = peers.some(p => p.user_id === u.user_id);
                return (
                  <li key={u.user_id} className="flex items-center gap-3 p-2 border-2 border-[#1A1A1A] rounded-lg">
                    <div className="w-10 h-10 rounded-full border-2 border-[#1A1A1A] overflow-hidden bg-[#E8DFF5] flex items-center justify-center">
                      {u.picture ? <img src={u.picture} alt="" className="w-full h-full object-cover" /> : <span className="font-bold">{u.name[0]?.toUpperCase()}</span>}
                    </div>
                    <div className="flex-1">
                      <div className="font-semibold">{u.name} {isPeer && <span className="text-xs ml-1 px-2 py-0.5 bg-[#A8E6CF] border border-[#1A1A1A] rounded-full">SAME NETWORK</span>}</div>
                      <div className="text-xs text-[#4A4A4A]">{u.email}</div>
                    </div>
                    {isFriend ? (
                      <span className="text-xs font-bold flex items-center gap-1 px-3 py-1 bg-[#E8DFF5] border-2 border-[#1A1A1A] rounded-full"><Check size={12} /> Friends</span>
                    ) : sentTo.has(u.user_id) ? (
                      <span className="text-xs font-bold flex items-center gap-1 px-3 py-1 bg-[#FDFBF7] border-2 border-[#1A1A1A] rounded-full text-[#4A4A4A]"><Check size={12} /> Sent</span>
                    ) : (
                      <button data-testid={`send-req-${u.user_id}`} onClick={() => sendReq(u.user_id)} className="nb-btn bg-[#FFD3B6] rounded-lg px-3 py-1.5 text-xs font-bold flex items-center gap-1"><UserPlus size={12} /> Add</button>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
