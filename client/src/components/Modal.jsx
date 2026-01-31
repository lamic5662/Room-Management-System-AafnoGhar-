export default function Modal({ open, title, subtitle, children, onClose }) {
  if (!open) return null;

  return (
    <div className="modalBg" onMouseDown={onClose}>
      <div className="modal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <div style={{ fontWeight: 900, fontSize: 18 }}>{title}</div>
            {subtitle ? <div className="muted" style={{ marginTop: 4, fontSize: 13 }}>{subtitle}</div> : null}
          </div>
          <button className="pill" onClick={onClose} style={{ padding: "4px 10px" }}>✕</button>
        </div>

        <div className="spacer" />
        {children}
      </div>
    </div>
  );
}
