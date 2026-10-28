"use client";

import { useState } from "react";

/** A value she has to paste somewhere else, with a button that copies it exactly. */
export default function CopyField({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Older phones without clipboard access: the text is still selectable below.
    }
  }

  return (
    <div style={{ margin: "0.5rem 0 0.75rem", border: "1px solid var(--line)", borderRadius: 8, padding: "0.5rem 0.75rem" }}>
      <div style={{ fontSize: "0.8rem", color: "var(--muted)" }}>{label}</div>
      <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", flexWrap: "wrap" }}>
        <code style={{ wordBreak: "break-all", flex: "1 1 14rem", userSelect: "all" }}>{value}</code>
        <button type="button" onClick={copy} style={{ padding: "0.35rem 0.8rem", borderRadius: 6, cursor: "pointer" }}>
          {copied ? "Copiado" : "Copiar"}
        </button>
      </div>
    </div>
  );
}
