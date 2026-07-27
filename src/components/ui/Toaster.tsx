"use client";

import { useEffect, useState } from "react";

/**
 * Minimal toast bus. Actions in this product used to succeed silently — a payment
 * logged and a payment lost looked identical. Any component can fire one without
 * threading state through the tree:
 *
 *   import { toast } from "@/components/ui/Toaster";
 *   toast("Payment recorded");
 */

interface ToastItem {
  id: number;
  text: string;
  tone: "ok" | "bad";
}

const EVENT = "handymanpro:toast";
let nextId = 1;

export function toast(text: string, tone: "ok" | "bad" = "ok") {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(EVENT, { detail: { id: nextId++, text, tone } }));
}

export default function Toaster() {
  const [items, setItems] = useState<ToastItem[]>([]);

  useEffect(() => {
    function onToast(e: Event) {
      const detail = (e as CustomEvent<ToastItem>).detail;
      // Cap the stack: a column of toasts hides more of the page than it explains.
      setItems((prev) => [...prev.slice(-2), detail]);
      setTimeout(() => {
        setItems((prev) => prev.filter((t) => t.id !== detail.id));
      }, 2600);
    }
    window.addEventListener(EVENT, onToast);
    return () => window.removeEventListener(EVENT, onToast);
  }, []);

  if (!items.length) return null;

  return (
    <div className="pointer-events-none fixed bottom-20 left-1/2 z-[60] flex -translate-x-1/2 flex-col items-center gap-2 md:bottom-6 md:left-auto md:right-6 md:translate-x-0 md:items-end">
      {items.map((t) => (
        <div
          key={t.id}
          className="ticket-snap flex items-center gap-2.5 border border-navy-700 bg-navy-900 px-4 py-2.5"
          style={{ borderLeft: `3px solid ${t.tone === "ok" ? "var(--emerald)" : "var(--rose)"}` }}
          role="status"
        >
          <span className="mono text-[12px] tracking-[0.04em] text-plate">{t.text}</span>
        </div>
      ))}
    </div>
  );
}
