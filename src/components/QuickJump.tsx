"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { Empty, spineFor } from "@/components/ui/primitives";

interface Hit {
  kind: "lead" | "job" | "invoice" | "client";
  id: string;
  title: string;
  sub: string;
  status: string;
  href: string;
}

const KIND_LABEL: Record<Hit["kind"], string> = {
  client: "CLIENT",
  job: "JOB",
  lead: "LEAD",
  invoice: "INV",
};

/* The combobox wiring points at these by id: the field's aria-controls names the list,
   its aria-activedescendant names the lit row. Only one QuickJump mounts at a time, so a
   fixed id per row is enough and keeps the two attributes readable. */
const LISTBOX_ID = "quickjump-listbox";
const optionId = (i: number) => `quickjump-option-${i}`;

/**
 * Cmd/Ctrl+K jump. A dispatcher on the phone needs the record in two seconds, and
 * clicking Leads → filter → scroll is not two seconds.
 */
export default function QuickJump() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      }
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (open) {
      setQ("");
      setHits([]);
      setActive(0);
      setTimeout(() => inputRef.current?.focus(), 20);
    }
  }, [open]);

  useEffect(() => {
    if (q.trim().length < 2) {
      setHits([]);
      return;
    }
    const ctrl = new AbortController();
    const t = setTimeout(() => {
      fetch(`/api/search?q=${encodeURIComponent(q)}`, { signal: ctrl.signal })
        .then((r) => r.json())
        .then((d) => {
          setHits(Array.isArray(d) ? d : []);
          setActive(0);
        })
        .catch(() => null);
    }, 140);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [q]);

  const go = useCallback(
    (hit?: Hit) => {
      if (!hit) return;
      setOpen(false);
      router.push(hit.href);
    },
    [router]
  );

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[70] flex items-start justify-center bg-navy-900/70 px-4 pt-[12vh]"
      onClick={() => setOpen(false)}
    >
      {/* Announced as a dialog and named, so a reader entering it is told it opened and
          what it is for. The keyboard already behaves: the field takes focus on open,
          arrows walk the hits, Escape closes. */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Jump to a lead, job, client or invoice"
        className="plate w-full max-w-[560px] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 border-b border-line px-4 py-3">
          <Search className="h-4 w-4 shrink-0 text-ink-3" strokeWidth={2} aria-hidden />
          {/* The field IS the combobox: it keeps focus while the arrows walk the hits, so
              the reader is told what it is (aria-label — the magnifier beside it is mute),
              that a list hangs off it (role + aria-controls), whether that list is showing
              (aria-expanded), and which row the arrow keys have landed on
              (aria-activedescendant). Focus never leaves the input; the highlighted option
              is named by id, the pattern a screen reader expects from ⌘K search. */}
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            role="combobox"
            aria-label="Search leads, jobs, clients and invoices"
            aria-autocomplete="list"
            aria-expanded={hits.length > 0}
            aria-controls={LISTBOX_ID}
            aria-activedescendant={hits.length > 0 ? optionId(active) : undefined}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setActive((i) => Math.min(i + 1, hits.length - 1));
              }
              if (e.key === "ArrowUp") {
                e.preventDefault();
                setActive((i) => Math.max(i - 1, 0));
              }
              if (e.key === "Enter") go(hits[active]);
            }}
            placeholder="Client, address, phone, invoice number…"
            className="t-row w-full border-0 bg-transparent px-0 py-1 focus:shadow-none"
            style={{ boxShadow: "none" }}
          />
          <span className="mono t-micro shrink-0 tracking-[0.08em] text-ink-3">ESC</span>
        </div>

        <div className="max-h-[52vh] overflow-auto">
          {/* Both states are status lines, left where the rows start. Centred, they
              read as a poster in the middle of a working tool. */}
          {q.trim().length < 2 && (
            <Empty className="border-t-0" hint="A name, a street, a phone number or an invoice number — two characters are enough to start.">
              Type at least two characters
            </Empty>
          )}
          {q.trim().length >= 2 && hits.length === 0 && (
            <Empty className="border-t-0" hint="Try the phone number without dashes, or a piece of the street name.">
              Nothing on the desk matches
            </Empty>
          )}
          {/* How many, spoken. The list moves under the arrow keys and a reader was
              told nothing about what had appeared. */}
          <span aria-live="polite" className="sr-only">
            {q.trim().length >= 2 ? `${hits.length} found` : ""}
          </span>
          {/* The rows are the listbox the field controls; each is an option a reader can
              hear as "N of M" with the lit one announced selected. The wrapper holds only
              options — the empty lines and the live count stay outside it, so nothing but a
              record answers to the arrow keys. */}
          {hits.length > 0 && (
            <div role="listbox" id={LISTBOX_ID} aria-label="Search results">
              {hits.map((hit, i) => (
                <button
                  key={`${hit.kind}-${hit.id}`}
                  role="option"
                  id={optionId(i)}
                  aria-selected={i === active}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => go(hit)}
                  className="flex w-full items-center gap-3 border-b border-line px-4 py-2.5 text-left last:border-b-0"
                  style={{ background: i === active ? "var(--sunk)" : undefined }}
                >
                  {/*
                    A CLIENT HAS NO STATUS. The search API answers every kind with the same
                    field, so every person in the book was stamped COMPLETED and given the
                    emerald spine that means «paid, done» everywhere else on the desk. A
                    colour that means something in nine places cannot mean nothing in the
                    tenth: the client rows carry the neutral spine and no state word.
                  */}
                  <span
                    className="h-7 w-[3px] shrink-0"
                    style={{
                      background: hit.kind === "client" ? "var(--slate)" : spineFor(hit.status),
                    }}
                    aria-hidden
                  />
                  <span className="mono t-micro w-[52px] shrink-0 tracking-[0.08em] text-ink-3">
                    {KIND_LABEL[hit.kind]}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="t-row block truncate font-bold text-ink">{hit.title}</span>
                    <span className="t-meta block truncate text-ink-2">{hit.sub}</span>
                  </span>
                  {hit.kind !== "client" && (
                    <span className="eyebrow shrink-0">{hit.status.replace("_", " ")}</span>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
