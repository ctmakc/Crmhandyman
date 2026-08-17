"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Plus, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { inCents, type InCents } from "@/lib/money";
import {
  PageHead,
  Row,
  Empty,
  Plate,
  Button,
  controlClass,
  Chip,
  Field,
  Money,
  StatTile,
  MeterBar,
  Skeleton,
  Stamp,
} from "@/components/ui/primitives";
import { toast } from "@/components/ui/Toaster";

/** The card as the API serves it: dollars. */
interface ApiClient {
  id: string;
  name: string;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  city?: string | null;
  jobCount: number;
  leadCount: number;
  equipmentCount: number;
  equipmentKinds: string[];
  openJobs: number;
  owing: number;
  lastSeen: string | null;
}

/** What this screen works in. */
type Client = InCents<ApiClient>;

/* --------------------------------------------------------------------------
   THE DEVICE (DESIGN.md revision 3): the card index / rolodex.
   A–Z thumb rail up top, letter dividers in a phone-book gutter, and every
   client as a file card — an initials tab sitting on the row's top rule.
   -------------------------------------------------------------------------- */

const ALPHA = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("").concat("#");

/** One box for a thumb tab, whether or not anybody is filed under it. */
const RAIL_LETTER =
  /* 12 + 4 + 8 + 2 of border = 26px, the same box as the row-scale button, so the
     rail does not invent a height of its own. */
  "mono t-meta inline-flex min-w-[26px] items-end justify-center border-b-2 px-1.5 pb-2 pt-1 !leading-none transition-colors duration-fast ease-instrument";

function letterOf(name: string) {
  const ch = (name.trim()[0] || "").toUpperCase();
  return /[A-Z]/.test(ch) ? ch : "#";
}

function anchorId(letter: string) {
  return `idx-${letter === "#" ? "num" : letter}`;
}

function initialsOf(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const raw =
    parts.length >= 2 ? `${parts[0][0]}${parts[1][0]}` : (parts[0] || "??").slice(0, 2);
  return raw.toUpperCase();
}

export default function ClientsPage() {
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [activeLetter, setActiveLetter] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    name: "",
    phone: "",
    email: "",
    address: "",
    city: "",
    notes: "",
  });

  async function fetchClients() {
    const params = new URLSearchParams();
    if (search) params.set("q", search);
    const res = await fetch(`/api/clients?${params}`);
    // The one door on this screen: dollars off the wire, cents in the index.
    const data = await res.json();
    setClients(Array.isArray(data) ? inCents(data as ApiClient[]) : []);
    setLoading(false);
  }

  useEffect(() => {
    fetchClients();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    const res = await fetch("/api/clients", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    if (res.ok) {
      toast("Client added");
      setShowForm(false);
      setForm({ name: "", phone: "", email: "", address: "", city: "", notes: "" });
      fetchClients();
    } else {
      toast(`${form.name || "That client"} was not added — no answer from the office`, "bad");
    }
  }

  const owingTotalCents = clients.reduce((s, c) => s + c.owingCents, 0);
  const withIron = clients.filter((c) => c.equipmentCount > 0).length;
  const owingCount = clients.filter((c) => c.owingCents > 0).length;

  /** Alphabetical card index: sorted, then filed under a letter divider. */
  const groups = useMemo(() => {
    const sorted = [...clients].sort((a, b) =>
      a.name.localeCompare(b.name, undefined, { sensitivity: "base" })
    );
    const map = new Map<string, Client[]>();
    for (const c of sorted) {
      const l = letterOf(c.name);
      if (!map.has(l)) map.set(l, []);
      map.get(l)!.push(c);
    }
    return map;
  }, [clients]);

  function jumpTo(letter: string) {
    setActiveLetter(letter);
    document
      .getElementById(anchorId(letter))
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  const searching = search.trim().length > 0;

  return (
    <div className="space-y-6 pb-24 md:pb-0">
      <PageHead
        eyebrow="The book"
        title="Clients"
        sub="One address, one history — every job, invoice and piece of iron on it."
        action={
          <Button variant="primary" onClick={() => setShowForm((v) => !v)}>
            {showForm ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
            {showForm ? "Close" : "New client"}
          </Button>
        }
      />

      {/* THE BOOK AT A GLANCE — three living readouts, raised onto plates off the
          deck. Each number counts up as the index lands; owing carries its true
          rose only when there is money on the street, never as decoration. The
          owing tile takes the full width on a phone so the figure reads large. */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <StatTile
          label="On the book"
          value={clients.length}
          foot={
            <p className="eyebrow leading-relaxed">
              {owingCount} owing · {Math.max(clients.length - owingCount, 0)} clear
            </p>
          }
        />
        <StatTile
          label="With equipment"
          value={withIron}
          foot={
            <>
              <MeterBar
                height={6}
                segments={[
                  { value: withIron, tone: "var(--ink-2)", label: "On file" },
                  {
                    value: Math.max(clients.length - withIron, 0),
                    tone: "var(--line)",
                    label: "None on file",
                  },
                ]}
                ariaLabel="Addresses with equipment on file"
              />
              <p className="eyebrow mt-2.5 leading-relaxed">
                {withIron} of {clients.length} on the book
              </p>
            </>
          }
        />
        <StatTile
          className="col-span-2 sm:col-span-1"
          label="Owing"
          value={owingTotalCents}
          money
          tone={owingTotalCents > 0 ? "var(--rose-ink)" : undefined}
          foot={
            <p className="eyebrow leading-relaxed">
              {owingCount > 0 ? `${owingCount} on the street` : "Nothing on the street"}
            </p>
          }
        />
      </div>

      {/* The A–Z thumb rail — the rolodex tabs — with the search at its end.
          The rail wraps rather than scrolls: at 390px an overflow box cut the
          alphabet at "U" with nothing to say it continued, and a phone book
          that stops at U reads as a broken screen. */}
      <div className="flex flex-col-reverse gap-2 border-b border-line sm:flex-row sm:items-end sm:gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-end sm:justify-between">
            {/* A rolodex with no cards in it has no tabs. */}
            {groups.size > 0 &&
              ALPHA.map((letter) =>
                groups.has(letter) ? (
                  <button
                    key={letter}
                    type="button"
                    onClick={() => jumpTo(letter)}
                    aria-label={`Jump to ${letter}`}
                    className={cn(RAIL_LETTER, "text-ink hover:border-amber", {
                      "border-amber": activeLetter === letter,
                      "border-transparent": activeLetter !== letter,
                    })}
                  >
                    {letter}
                  </button>
                ) : (
                  /* A letter with nobody under it still carries a fact. It used to
                     run at opacity .35 — 1.6:1, the last contrast failure in the
                     product; it is the same ink as every other quiet label now.
                     It also carries the button's own box, or the phone's 44px tap
                     rule lifts every live letter above the dead ones and the rail
                     comes apart into two ragged rows. */
                  <span
                    key={letter}
                    aria-hidden="true"
                    className={cn(
                      RAIL_LETTER,
                      "min-h-[44px] select-none border-transparent text-ink-3 sm:min-h-0"
                    )}
                  >
                    {letter}
                  </span>
                )
              )}
          </div>
        </div>
        <div className="w-full pb-2 sm:w-[240px] sm:shrink-0">
          <div className="relative">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-3"
              strokeWidth={2}
              aria-hidden
            />
            <input
              aria-label="Search the book by name, phone or address"
              placeholder="Name, phone, address…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className={controlClass("!pl-9")}
            />
          </div>
        </div>
      </div>

      {showForm && (
        <Plate className="p-5">
          <div className="eyebrow">New client record</div>
          <form onSubmit={handleAdd} className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field id="client-name" label="Name" required>
              {(f) => (
                <input
                  {...f}
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                />
              )}
            </Field>
            <Field id="client-phone" label="Phone">
              {(f) => (
                <input
                  {...f}
                  type="tel"
                  autoComplete="tel"
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  className={cn(f.className, "mono")}
                />
              )}
            </Field>
            <Field id="client-email" label="Email">
              {(f) => (
                <input
                  {...f}
                  type="email"
                  autoComplete="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                />
              )}
            </Field>
            <Field id="client-city" label="City">
              {(f) => (
                <input
                  {...f}
                  value={form.city}
                  onChange={(e) => setForm({ ...form, city: e.target.value })}
                />
              )}
            </Field>
            <Field id="client-address" label="Address" className="sm:col-span-2">
              {(f) => (
                <input
                  {...f}
                  value={form.address}
                  onChange={(e) => setForm({ ...form, address: e.target.value })}
                />
              )}
            </Field>
            <Field
              id="client-notes"
              label="Notes"
              hint="Gate code, dog, where the panel is."
              className="sm:col-span-2"
            >
              {(f) => (
                <textarea
                  {...f}
                  rows={2}
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                />
              )}
            </Field>
            <div className="actions sm:col-span-2">
              <Button type="submit" variant="primary">
                Add client
              </Button>
              <Button type="button" variant="ghost" onClick={() => setShowForm(false)}>
                Cancel
              </Button>
            </div>
          </form>
        </Plate>
      )}

      {/* The card index: letter dividers in the gutter, file cards to the right. */}
      {loading ? (
        <Skeleton lines={5} />
      ) : clients.length === 0 ? (
        /* Two different facts, two different lines: a book nobody has filled in
           yet, and a search that found nothing in a book that has plenty. */
        searching ? (
          <Empty
            hint={`Nothing matches “${search}”. The search runs over the name, the phone number and the street.`}
            action={
              <Button variant="ghost" onClick={() => setSearch("")}>
                Clear search
              </Button>
            }
          >
            No client matches that
          </Empty>
        ) : (
          <Empty
            hint="Every job, invoice and unit hangs off a client. Put the first one on the book and the rest of the desk has somewhere to file itself."
            action={
              <Button variant="primary" onClick={() => setShowForm(true)}>
                <Plus className="h-4 w-4" /> New client
              </Button>
            }
          >
            No clients on the book yet
          </Empty>
        )
      ) : (
        <div>
          {ALPHA.filter((l) => groups.has(l)).map((letter) => (
            <section
              key={letter}
              id={anchorId(letter)}
              className="grid scroll-mt-6 grid-cols-[36px_1fr] border-t border-line md:grid-cols-[56px_1fr]"
            >
              {/* The phone-book thumb: the letter, sticky so it reads as a divider
                  while its group scrolls past. */}
              <div className="border-r border-line pt-4">
                <span className="mono t-record sticky top-4 block pl-0.5 font-medium text-ink-3 md:pl-1.5">
                  {letter}
                </span>
              </div>

              <div>
                {groups.get(letter)!.map((c) => (
                  <Row
                    key={c.id}
                    className="row-tab"
                    // Green means "worked for, settled up" — a name with no jobs yet is neutral.
                    status={
                      c.owingCents > 0
                        ? "OVERDUE"
                        : c.openJobs > 0
                          ? "IN_PROGRESS"
                          : c.jobCount > 0
                            ? "COMPLETED"
                            : "DRAFT"
                    }
                  >
                    {/* Stretched link: the whole card opens the dossier, while the tel:
                        anchor below stays a real link — no <a>-inside-<a> hydration break. */}
                    <Link
                      href={`/clients/${c.id}`}
                      className="absolute inset-0"
                      aria-label={`Open ${c.name}`}
                    />
                    {/* The file tab: initials on a half-raised tab straddling the top rule. */}
                    <span className="mono t-micro absolute left-5 top-0 -translate-y-1/2 rounded-t border border-b-0 border-line bg-plate px-1.5 py-1 font-medium uppercase leading-none tracking-[0.1em] text-ink-2">
                      {initialsOf(c.name)}
                    </span>

                    <div className="flex items-baseline justify-between gap-3">
                      <p className="t-row min-w-0 truncate font-bold text-ink">{c.name}</p>
                      {c.owingCents > 0 ? (
                        <span className="shrink-0 whitespace-nowrap text-right">
                          <span className="eyebrow mr-1.5" style={{ color: "var(--rose-ink)" }}>
                            Owing
                          </span>
                          <Money
                            cents={c.owingCents}
                            className="t-body font-bold"
                            tone="var(--rose-ink)"
                          />
                        </span>
                      ) : c.lastSeen ? (
                        /* On the phone the name keeps the line: the date of the
                           last visit is the first fact worth losing, and a
                           truncated client name is the last one. */
                        <span className="eyebrow hidden shrink-0 whitespace-nowrap text-right sm:inline">
                          Last <Stamp date={c.lastSeen} className="t-meta" />
                        </span>
                      ) : null}
                    </div>
                    <p className="t-body mt-1 truncate text-ink-2">
                      {[c.address, c.city].filter(Boolean).join(", ") || "No address on file"}
                    </p>

                    <div className="mt-3 flex flex-wrap items-baseline gap-x-4 gap-y-2 border-t border-line pt-2">
                      {c.phone ? (
                        <a
                          href={`tel:${c.phone}`}
                          onClick={(e) => e.stopPropagation()}
                          /* Above the row's stretched link, or the tap that should
                             ring the client opens the file instead. */
                          className="mono t-meta relative z-[2] inline-flex text-ink underline underline-offset-4 hover:text-sky-ink"
                        >
                          {c.phone}
                        </a>
                      ) : (
                        <span className="mono t-meta text-ink-3">
                          {c.email || "NO CONTACT ON FILE"}
                        </span>
                      )}
                      <span className="mono t-meta text-ink-2">
                        {c.jobCount === 0 && c.leadCount > 0
                          ? `LEAD ONLY · ${c.leadCount}`
                          : `${c.jobCount} ${c.jobCount === 1 ? "JOB" : "JOBS"}`}
                      </span>
                      {c.openJobs > 0 && (
                        <span className="mono t-meta" style={{ color: "var(--amber-ink)" }}>
                          {c.openJobs} OPEN
                        </span>
                      )}
                      {/* The iron on the address, recessed rather than framed. */}
                      {(c.equipmentKinds ?? []).map((k, i) => (
                        <Chip key={`${k}-${i}`}>{k}</Chip>
                      ))}
                      {c.equipmentCount > (c.equipmentKinds?.length ?? 0) && (
                        <Chip
                          title={`${c.equipmentCount} units on this address`}
                        >{`+${c.equipmentCount - c.equipmentKinds.length}`}</Chip>
                      )}
                      {/* The last visit sits at the head of the row on the desk;
                          it comes down here when money took that slot, and on the
                          phone, where the head belongs to the name. Printing it in
                          both places at once was the row repeating itself. */}
                      {c.lastSeen && (
                        <span className={cn("eyebrow", c.owingCents === 0 && "sm:hidden")}>
                          Last <Stamp date={c.lastSeen} className="t-meta" />
                        </span>
                      )}
                    </div>
                  </Row>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
