export default function StoryAvatar({ name, picture, active = false, size = 56 }) {
  return (
    <div className="rounded-full p-[2px]" style={{
      background: active ? "linear-gradient(45deg, #FFD3B6, #E8DFF5, #A8E6CF)" : "#E5E5E5",
      width: size, height: size,
    }}>
      <div className="w-full h-full rounded-full border-2 border-[#1A1A1A] overflow-hidden bg-white flex items-center justify-center">
        {picture ? <img src={picture} alt={name} className="w-full h-full object-cover" /> : <span className="font-bold">{(name || "?")[0]?.toUpperCase()}</span>}
      </div>
    </div>
  );
}
