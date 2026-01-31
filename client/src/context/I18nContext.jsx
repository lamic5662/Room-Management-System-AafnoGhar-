import { createContext, useContext, useMemo, useState } from "react";
import { translations } from "../i18n/translations";

const I18nCtx = createContext(null);

export function I18nProvider({ children }) {
  const [lang, setLangState] = useState(() => localStorage.getItem("lang") || "en");

  const setLang = (next) => {
    const value = next === "ne" ? "ne" : "en";
    setLangState(value);
    localStorage.setItem("lang", value);
  };

  const t = (text) => {
    if (!text) return "";
    const dict = translations[lang] || {};
    return dict[text] || text;
  };

  const value = useMemo(() => ({ lang, setLang, t }), [lang]);

  return <I18nCtx.Provider value={value}>{children}</I18nCtx.Provider>;
}

export function useI18n() {
  return useContext(I18nCtx);
}
