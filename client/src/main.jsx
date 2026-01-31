import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { BrowserRouter } from "react-router-dom";
import { ToastProvider } from "./context/ToastContext";
import { I18nProvider } from "./context/I18nContext";
import { NotificationProvider } from "./context/NotificationContext";
import "leaflet/dist/leaflet.css";
import "./index.css";
import "./styles.css";


ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <BrowserRouter>
      <ToastProvider>
        <I18nProvider>
          <NotificationProvider>
            <App />
          </NotificationProvider>
        </I18nProvider>
      </ToastProvider>
    </BrowserRouter>
  </React.StrictMode>
);
