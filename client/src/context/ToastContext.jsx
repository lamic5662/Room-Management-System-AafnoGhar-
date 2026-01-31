import { createContext, useContext, useState } from "react";

const ToastCtx = createContext(null);

export function ToastProvider({ children }) {
  const [toast, setToast] = useState({ type: "info", message: "" });

  const showToast = (type, message) => {
    setToast({ type, message });
    setTimeout(() => setToast({ type: "info", message: "" }), 2600);
  };

  return (
    <ToastCtx.Provider value={{ showToast }}>
      {children}
      <ToastView toast={toast} onClose={() => setToast({ type: "info", message: "" })} />
    </ToastCtx.Provider>
  );
}

export function useToast() {
  return useContext(ToastCtx);
}

function ToastView({ toast, onClose }) {
  if (!toast.message) return null;

  const cls =
    toast.type === "success" ? "toast ok" : toast.type === "error" ? "toast err" : "toast";

  return (
    <div className={cls}>
      <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>{toast.message}</div>
        <button className="pill" onClick={onClose} style={{ padding: "4px 10px" }}>
          ✕
        </button>
      </div>
    </div>
  );
}
