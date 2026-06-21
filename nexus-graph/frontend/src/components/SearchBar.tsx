import React, { useCallback } from "react";

interface Props {
  value: string;
  onChange: (val: string) => void;
}

export default function SearchBar({ value, onChange }: Props) {
  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => onChange(e.target.value),
    [onChange]
  );

  return (
    <div style={{ position: "relative", minWidth: 220 }}>
      <span style={{
        position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)",
        color: "#64748b", fontSize: 14, pointerEvents: "none",
      }}>
        🔍
      </span>
      <input
        data-testid="input-search"
        type="text"
        placeholder="Search entities…"
        value={value}
        onChange={handleChange}
        style={{
          background: "#1a1a2e", color: "#e2e8f0",
          border: "1px solid #2e2e4f", borderRadius: 6,
          padding: "6px 10px 6px 32px", fontSize: 13,
          outline: "none", width: "100%",
          transition: "border-color 0.2s",
        }}
        onFocus={(e) => (e.target.style.borderColor = "#4f46e5")}
        onBlur={(e) => (e.target.style.borderColor = "#2e2e4f")}
      />
    </div>
  );
}
