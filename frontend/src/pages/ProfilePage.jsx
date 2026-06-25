import { useState, useEffect, useRef } from "react";
import { useAuth } from "@/context/AuthContext";
import { api } from "@/lib/api";
import { Camera, Save, Wifi, Users, Mail } from "lucide-react";
import { toast } from "sonner";

export default function ProfilePage({ friends, peers, onChange }) {
  const { user, refreshUser } = useAuth();
  const [name, setName] = useState(user?.name || "");
  const [bio, setBio] = useState(user?.bio || "");
  const [homeGroup, setHomeGroup] = useState(user?.home_group || "");
  const [busy, setBusy] = useState(false);
  const [reqs, setReqs] = useState([]);
  const fileRef = useRef(null);

  useEffect(() => {
    api.get("/friends/requests").then((res) => setReqs(res.data)).catch(() => {});
  }, []);

  const handleSave = async () => {
    setBusy(true);
    try {
      await api.patch("/users/me", { name, bio, home_group: homeGroup });
      await refreshUser();
      toast.success("Profile updated");
    } catch {
      toast.error("Could not save");
    } finally {
      setBusy(false);
    }
  };

  const handleAvatar = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const fd = new FormData();
      fd.append("file", file);
      const up = await api.post("/upload", fd, { headers: { "Content-Type": "multipart/form-data" } });
      const url = `${process.env.REACT_APP_BACKEND_URL}/api/files/${up.data.file_id}/download?auth=${encodeURIComponent(localStorage.getItem("hn_token") || "")}`;
      await api.patch("/users/me", { picture: url });
      await refreshUser();
      toast.success("Avatar updated");
    } catch {
      toast.error("Upload failed");
    }
  };

  const respond = async (request_id, accept) => {
    await api.post("/friends/respond", { request_id, accept });
    setReqs(reqs.filter(r => r.request_id !== request_id));
    onChange?.();
  };

  return (
    <main className="flex-1 overflow-y-auto bg-[#FDFBF7]">
      <div className="max-w-3xl mx-auto p-8 space-y-8">
        <h1 className="font-head font-black text-4xl tracking-tight">Profile</h1>

        <div className="nb-card p-8 flex flex-col md:flex-row gap-6 items-start">
          <div className="relative">
            <div className="w-32 h-32 rounded-full border-2 border-[#1A1A1A] overflow-hidden bg-[#E8DFF5] flex items-center justify-center">
              {user?.picture ? <img src={user.picture} alt="" className="w-full h-full object-cover" /> : <span className="font-head font-black text-4xl">{user?.name?.[0]?.toUpperCase()}</span>}
            </div>
            <button data-testid="upload-avatar-btn" onClick={() => fileRef.current?.click()} className="absolute -bottom-2 -right-2 nb-btn bg-[#FFD3B6] rounded-full p-3">
              <Camera size={16} />
            </button>
            <input ref={fileRef} type="file" accept="image/*" hidden onChange={handleAvatar} />
          </div>
          <div className="flex-1 space-y-3 w-full">
            <div>
              <label className="text-sm font-bold">Name</label>
              <input data-testid="profile-name-input" value={name} onChange={(e) => setName(e.target.value)} className="nb-input mt-1" />
            </div>
            <div>
              <label className="text-sm font-bold">Bio</label>
              <textarea data-testid="profile-bio-input" value={bio} onChange={(e) => setBio(e.target.value)} className="nb-input mt-1" rows={2} placeholder="Tell others about you" />
            </div>
            <div>
              <label className="text-sm font-bold">Home group code <span className="text-[#4A4A4A] font-normal">(optional - share with members on same WiFi)</span></label>
              <input data-testid="home-group-input" value={homeGroup} onChange={(e) => setHomeGroup(e.target.value)} className="nb-input mt-1" placeholder="e.g. casa-2026" />
            </div>
            <div className="flex gap-2 items-center text-sm text-[#4A4A4A]">
              <Mail size={14} /> {user?.email}
            </div>
            <button data-testid="save-profile-btn" onClick={handleSave} disabled={busy} className="nb-btn bg-[#A8E6CF] rounded-xl px-5 py-2 font-bold flex items-center gap-2 disabled:opacity-50">
              <Save size={16} /> Save changes
            </button>
          </div>
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          <div className="nb-card p-6">
            <div className="flex items-center gap-2 mb-3">
              <Wifi size={18} /> <h2 className="font-head font-black text-xl">On your network</h2>
            </div>
            {peers.length === 0 ? <p className="text-sm text-[#4A4A4A]">No one else here right now.</p> : (
              <ul className="space-y-2">
                {peers.map(p => (
                  <li key={p.user_id} className="flex items-center gap-3 p-2 border-2 border-[#1A1A1A] rounded-lg bg-white">
                    <div className="w-9 h-9 rounded-full border-2 border-[#1A1A1A] overflow-hidden bg-[#FFD3B6] flex items-center justify-center">
                      {p.picture ? <img src={p.picture} alt="" className="w-full h-full object-cover" /> : <span className="font-bold text-sm">{p.name[0]?.toUpperCase()}</span>}
                    </div>
                    <span className="font-semibold">{p.name}</span>
                    <span className="ml-auto text-xs font-bold px-2 py-0.5 bg-[#A8E6CF] border border-[#1A1A1A] rounded-full">FAST</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="nb-card p-6">
            <div className="flex items-center gap-2 mb-3">
              <Users size={18} /> <h2 className="font-head font-black text-xl">Friends ({friends.length})</h2>
            </div>
            {friends.length === 0 ? <p className="text-sm text-[#4A4A4A]">No friends yet. Send a request from the Friends panel.</p> : (
              <ul className="space-y-2">
                {friends.map(f => (
                  <li key={f.user_id} className="flex items-center gap-3 p-2 border-2 border-[#1A1A1A] rounded-lg bg-white">
                    <div className="w-9 h-9 rounded-full border-2 border-[#1A1A1A] overflow-hidden bg-[#E8DFF5] flex items-center justify-center">
                      {f.picture ? <img src={f.picture} alt="" className="w-full h-full object-cover" /> : <span className="font-bold text-sm">{f.name[0]?.toUpperCase()}</span>}
                    </div>
                    <span className="font-semibold">{f.name}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <div className="nb-card p-6">
          <h2 className="font-head font-black text-xl mb-3">Friend requests ({reqs.length})</h2>
          {reqs.length === 0 ? <p className="text-sm text-[#4A4A4A]">No pending requests.</p> : (
            <ul className="space-y-2">
              {reqs.map(r => (
                <li key={r.request_id} className="flex items-center gap-3 p-3 border-2 border-[#1A1A1A] rounded-lg bg-white">
                  <div className="w-10 h-10 rounded-full border-2 border-[#1A1A1A] overflow-hidden bg-[#FFD3B6] flex items-center justify-center">
                    {r.from_user_info?.picture ? <img src={r.from_user_info.picture} alt="" className="w-full h-full object-cover" /> : <span className="font-bold">{r.from_user_info?.name?.[0]?.toUpperCase()}</span>}
                  </div>
                  <div className="flex-1">
                    <div className="font-semibold">{r.from_user_info?.name}</div>
                    <div className="text-xs text-[#4A4A4A]">{r.from_user_info?.email}</div>
                  </div>
                  <button data-testid={`accept-req-${r.request_id}`} onClick={() => respond(r.request_id, true)} className="nb-btn bg-[#A8E6CF] rounded-lg px-3 py-1.5 text-sm font-bold">Accept</button>
                  <button data-testid={`decline-req-${r.request_id}`} onClick={() => respond(r.request_id, false)} className="nb-btn bg-white rounded-lg px-3 py-1.5 text-sm font-bold">Decline</button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </main>
  );
}
