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

  /**
   * The region is always mounted, even with nothing in it. A live region that is
   * created at the same moment as its first message is not announced — the toast
   * was silent for anyone not looking at the bottom right of the screen.
   */
  return (
    <div
      className="pointer-events-none fixed bottom-20 left-1/2 z-[60] flex -translate-x-1/2 flex-col items-center gap-2 md:bottom-6 md:left-auto md:right-6 md:translate-x-0 md:items-end"
      role="status"
      aria-live="polite"
      aria-atomic="false"
    >
      {items.map((t) => (
        <div
          key={t.id}
          className="ticket-snap flex items-center gap-2.5 border border-navy-700 bg-navy-900 px-4 py-2.5"
          style={{ borderLeft: `3px solid ${t.tone === "ok" ? "var(--emerald)" : "var(--rose)"}` }}
        >
          {/* The spine colour carries the tone on the desk; the glyph carries it in
              sunlight and for anyone who cannot separate red from green. It is drawn
              in --plate rather than in the tone: the semantic hues sit near 3.4:1 on
              navy, and a shape at 17:1 says more than a colour at 3.4:1. */}
          <span aria-hidden className="mono text-[12px] font-bold leading-none text-plate">
            {t.tone === "ok" ? "✓" : "!"}
          </span>
          <span className="mono text-[12px] tracking-[0.04em] text-plate">{t.text}</span>
        </div>
      ))}
    </div>
  );
}
