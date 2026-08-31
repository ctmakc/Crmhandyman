"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

interface FollowUp {
  id: string;
  dueDate: string;
  status: string;
  assignedTo?: { id: string; name: string };
  lead: {
    id: string;
    name: string;
    phone?: string;
    city?: string;
    jobType?: string;
    status: string;
    source: string;
  };
}

function localDay(date: Date): string {
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

function dueTone(iso: string): { label: string; className: string } {
  const due = new Date(iso);
  const now = new Date();
  if (due.getTime() < now.getTime()) return { label: "OVERDUE", className: "text-rose-ink" };
  if (localDay(due) === localDay(now)) return { label: "TODAY", className: "text-amber-ink" };
  return { label: "UPCOMING", className: "text-ink-3" };
}

function when(iso: string): string {
  return new Date(iso).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/** Sales callbacks belong beside the lead call sheet, not buried in the crew kanban. */
export default function LeadFollowUpInbox() {
  const pathname = usePathname();
  const [items, setItems] = useState<FollowUp[]>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (pathname !== "/leads") return;
    let alive = true;
    fetch("/api/leads/follow-ups")
      .then((res) => (res.ok ? res.json() : []))
      .then((rows) => {
        if (alive) setItems(Array.isArray(rows) ? rows : []);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [pathname]);

  if (pathname !== "/leads" || items.length === 0) return null;

  const overdue = items.filter((item) => new Date(item.dueDate).getTime() < Date.now()).length;

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed bottom-20 right-4 z-40 rounded bg-navy-900 px-4 py-3 t-body font-bold text-plate md:bottom-6 md:right-6"
      >
        Follow-ups {items.length}{overdue ? ` · ${overdue} overdue` : ""}
      </button>
    );
  }

  return (
    <aside className="plate fixed bottom-20 right-4 z-40 max-h-[70vh] w-[min(440px,calc(100vw-2rem))] overflow-y-auto p-4 md:bottom-6 md:right-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="eyebrow">Callback queue</div>
          <p className="t-row mt-1 font-bold text-ink">{items.length} follow-up{items.length === 1 ? "" : "s"}</p>
        </div>
        <button type="button" className="eyebrow hover:text-ink" onClick={() => setOpen(false)}>
          Close
        </button>
      </div>

      <div className="mt-3 border-t border-line">
        {items.map((item) => {
          const tone = dueTone(item.dueDate);
          return (
            <Link
              key={item.id}
              href={`/leads/${item.lead.id}`}
              className="block border-b border-line px-1 py-3 hover:bg-sunk"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="t-row truncate font-bold text-ink">{item.lead.name}</p>
                  <p className="t-body mt-1 truncate text-ink-2">
                    {[item.lead.jobType, item.lead.city, item.lead.phone].filter(Boolean).join(" · ")}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <div className={`eyebrow ${tone.className}`}>{tone.label}</div>
                  <div className="mono t-meta mt-1 text-ink-2">{when(item.dueDate)}</div>
                </div>
              </div>
              {item.assignedTo?.name && <div className="eyebrow mt-2">{item.assignedTo.name}</div>}
            </Link>
          );
        })}
      </div>
    </aside>
  );
}
