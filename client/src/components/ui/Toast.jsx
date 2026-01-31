export default function Toast({ type = "info", message = "", onClose }) {
  if (!message) return null;

  const styles =
    type === "success"
      ? "border-green-200 bg-green-50 text-green-800"
      : type === "error"
      ? "border-red-200 bg-red-50 text-red-800"
      : "border-gray-200 bg-white text-gray-800";

  return (
    <div className={"fixed top-4 right-4 z-50 border rounded-xl px-4 py-3 shadow " + styles}>
      <div className="flex items-start gap-3">
        <div className="text-sm">{message}</div>
        <button onClick={onClose} className="text-xs opacity-70 hover:opacity-100">
          ✕
        </button>
      </div>
    </div>
  );
}
