import { useEffect, useMemo, useRef } from "react";
import "@sajanm/nepali-date-picker/dist/nepali.datepicker.v5.0.6.min.js";
import "@sajanm/nepali-date-picker/dist/nepali.datepicker.v5.0.6.min.css";
import { BSToAD } from "bikram-sambat-js";

export default function NepaliDateInput({ label, value, onChange, placeholder = "2079-01-01" }) {
  const inputRef = useRef(null);
  const initializedRef = useRef(false);

  const handleSelect = (bsDate) => {
    if (!bsDate) {
      onChange("", "");
      return;
    }
    const adDate = safeBSToAD(bsDate);
    onChange(bsDate, adDate);
  };

  const display = useMemo(() => value || "", [value]);

  useEffect(() => {
    const el = inputRef.current;
    if (!el || initializedRef.current) return;

    // Initialize nepali date picker (vanilla JS plugin)
    // eslint-disable-next-line no-undef
    el.nepaliDatePicker({ dateFormat: "YYYY-MM-DD" });
    initializedRef.current = true;

    const onInputChange = (e) => handleSelect(e.target.value);
    el.addEventListener("change", onInputChange);

    return () => {
      el.removeEventListener("change", onInputChange);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (inputRef.current) inputRef.current.value = display;
  }, [display]);

  return (
    <div className="nepaliDateInput">
      {label ? <label className="muted" style={{ fontSize: 12 }}>{label}</label> : null}
      <input
        ref={inputRef}
        type="text"
        className="input"
        placeholder={placeholder}
        defaultValue={display}
      />
    </div>
  );
}

function safeBSToAD(bs) {
  try {
    return BSToAD(bs);
  } catch {
    return "";
  }
}
