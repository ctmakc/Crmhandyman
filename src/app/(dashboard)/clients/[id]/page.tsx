"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { Plus, Trash2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatCents, inCents, type InCents } from "@/lib/money";
import {
  Plate,
  Empty,
  BackLink,
  Button,
  buttonClass,
  Chip,
  Field,
  Num,
  Stamp,
  spineFor,
  textToneFor,
  Skeleton,
  LaneHead,
  Readout,
  Money,
} from "@/components/ui/primitives";
import { toast } from "@/components/ui/Toaster";
import { isOverdue, daysOverdue, lateWord } from "@/lib/invoice-state";

/* --------------------------------------------------------------------------
   THE DOSSIER (DESIGN.md revision 3, deepened): one client file, opened flat.
   Header = the file-card plate (paper you could hold). Body = asymmetric
   7/5 split on a single vertical rule: the HISTORY and PAPER ledgers on the
   left, the MONEY / IRON / SERVICE lanes on the right. No tabs, no boxed
   stat grid — ruled lanes only.
   -------------------------------------------------------------------------- */

interface Equipment {
  id: string;
  kind: string;
  brand?: string | null;
  model?: string | null;
  serial?: string | null;
  location?: string | null;
  installedAt?: string | null;
  warrantyUntil?: string | null;
  notes?: string | null;
}

interface ApiClientInvoice {
  id: string;
  number: string;
  status: string;
  total: number;
  amountPaid: number;
  dueDate: string | null;
  issuedAt: string;
  projectTitle: string;
}

interface ApiClientProject {
  id: string;
  title: string;
  status: string;
  address: string;
  jobType?: string | null;
  scheduledDate?: string | null;
  completedDate?: string | null;
  createdAt: string;
  invoices: Array<{ total: number }>;
  estimates: Array<{ total: number; status: string }>;
}

type ClientProject = InCents<ApiClientProject>;

interface ApiServicePlan {
  id: string;
  name: string;
  pricePerVisit: number;
  visitMonths: string;
  active: boolean;
}

/** The whole card as the API serves it: dollars. */
interface ApiClientRecord {
  id: string;
  name: string;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  city?: string | null;
  notes?: string | null;
  equipment: Equipment[];
  contracts: ApiServicePlan[];
  leads: Array<{ id: string; name: string; source: string; status: string; createdAt: string }>;
  projects: ApiClientProject[];
  invoices: ApiClientInvoice[];
  totals: { owing: number; collected: number; costs: number; lifetime: number };
}

/** What this screen works in. */
type ClientRecord = InCents<ApiClientRecord>;

const KINDS = [
  "FURNACE",
  "AC",
  "HEAT_PUMP",
  "WATER_HEATER",
  "BOILER",
  "THERMOSTAT",
  "DUCTWORK",
  "OTHER",
];

function initialsOf(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const raw =
    parts.length >= 2 ? `${parts[0][0]}${parts[1][0]}` : (parts[0] || "??").slice(0, 2);
  return raw.toUpperCase();
}

/** `visitMonths` is a JSON array of 1–12 — the next one coming is the due month. */
function nextVisitLabel(visitMonths: string): string | null {
  try {
    const months = (JSON.parse(visitMonths) as number[])
      .filter((m) => Number.isInteger(m) && m >= 1 && m <= 12)
      .sort((a, b) => a - b);
    if (months.length === 0) return null;
    const current = new Date().getMonth() + 1;
    const next = months.find((m) => m >= current) ?? months[0];
    return new Date(2000, next - 1, 1)
      .toLocaleString("en-CA", { month: "short" })
      .toUpperCase();
  } catch {
    return null;
  }
}

/**
 * How long a warranty has left, or how long it has been dead — in the words a
 * tech uses on the doorstep. The colour of the line is the last thing that
 * carries this: in a basement, in a glove, under one bulb, it is the WORD that
 * has to say whether the part is still covered.
 */
function warrantyTerm(until: string): { live: boolean; term: string } {
  const end = new Date(until);
  const now = new Date();
  const months = Math.round((end.getTime() - now.getTime()) / (86_400_000 * 30.44));
  const live = end > now;
  const n = Math.abs(months);
  const term =
    n >= 24
      ? `${Math.round(n / 12)} years`
      : n >= 12
        ? `${Math.floor(n / 12)} year ${n % 12 ? `${n % 12} months` : ""}`.trim()
        : `${Math.max(n, 1)} ${n === 1 ? "month" : "months"}`;
  return { live, term };
}

/** What a job line is worth on the ledger: billed money first, the estimate as fallback. */
function jobMoney(p: ClientProject): { cents: number; est: boolean } | null {
  if (p.invoices.length > 0)
    return { cents: p.invoices.reduce((s, i) => s + i.totalCents, 0), est: false };
  const est = p.estimates.find((e) => e.status === "ACCEPTED") ?? p.estimates[0];
  return est ? { cents: est.totalCents, est: true } : null;
}

export default function ClientDetailPage({ params }: { params: { id: string } }) {
  const { data: session } = useSession();
  /**
   * The office keeps the service contracts; `/api/clients/[id]` hands a tech an
   * empty list. Printed as an empty lane, that silence became a sentence — the
   * screen told a man standing in the customer's basement that there is no
   * maintenance plan on an address that has one. The lane belongs to the desk.
   */
  const isAdmin = (session?.user as { role?: string } | undefined)?.role === "ADMIN";

  const [client, setClient] = useState<ClientRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [showEquip, setShowEquip] = useState(false);
  const [equipForm, setEquipForm] = useState({
    kind: "FURNACE",
    brand: "",
    model: "",
    serial: "",
    location: "",
    installedAt: "",
    warrantyUntil: "",
    notes: "",
  });

  const load = useCallback(async () => {
    const res = await fetch(`/api/clients/${params.id}`);
    // The one door on this screen: dollars off the wire, cents on the card.
    if (res.ok) setClient(inCents((await res.json()) as ApiClientRecord));
    setLoading(false);
  }, [params.id]);

  useEffect(() => {
    load();
  }, [load]);

  async function addEquipment(e: React.FormEvent) {
    e.preventDefault();
    const res = await fetch(`/api/clients/${params.id}/equipment`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(equipForm),
    });
    if (res.ok) {
      toast("Unit added");
      setShowEquip(false);
      setEquipForm({
        kind: "FURNACE",
        brand: "",
        model: "",
        serial: "",
        location: "",
        installedAt: "",
        warrantyUntil: "",
        notes: "",
      });
      load();
    } else {
      toast("The unit was not saved — check the serial and try again", "bad");
    }
  }

  async function removeEquipment(id: string) {
    await fetch(`/api/clients/${params.id}/equipment?equipmentId=${id}`, { method: "DELETE" });
    toast("Unit removed");
    load();
  }

  if (loading) return <Skeleton lines={5} />;
  if (!client)
    return (
      <Empty
        hint="The file may have been removed, or the link came from another workspace."
        action={
          <Link href="/clients" className={buttonClass("ghost")}>
            Back to the book
          </Link>
        }
      >
        That client file is not on this book
      </Empty>
    );

  const owingCents = client.totals.owingCents;
  const openJobs = client.projects.filter(
    (p) => p.status === "SCHEDULED" || p.status === "IN_PROGRESS"
  ).length;

  /** The history ledger: every job, newest ink first. */
  const history = client.projects
    .map((p) => ({ ...p, when: p.completedDate || p.scheduledDate || p.createdAt }))
    .sort((a, b) => new Date(b.when).getTime() - new Date(a.when).getTime());

  /** The paper ledger: the ones being chased sit on top, in red. */
  const paper = [...client.invoices].sort((a, b) => {
    const lateDiff = Number(isOverdue(b)) - Number(isOverdue(a));
    if (lateDiff !== 0) return lateDiff;
    return new Date(b.issuedAt).getTime() - new Date(a.issuedAt).getTime();
  });

  return (
    /* `page-doc` without `mx-auto`: every other record in the product runs its
       980px column from the left gutter, and a centred one starts its title 108px
       further in than the invoice beside it. */
    <div className="page-doc space-y-6 pb-24 md:pb-0">
      <BackLink href="/clients" label="All clients" />

      {/* The file card itself — the one closed frame the dossier earns. */}
      <div
        className="plate px-5 pb-5 pt-6"
        style={{
          borderLeft: `4px solid ${
            owingCents > 0 ? "var(--rose)" : openJobs > 0 ? "var(--amber)" : "var(--emerald)"
          }`,
        }}
      >
        {/* The pulled-file tab, same as the card index rows. */}
        <span className="mono t-micro absolute left-5 top-0 -translate-y-1/2 rounded-t border border-b-0 border-line bg-plate px-1.5 py-1 font-medium uppercase leading-none tracking-[0.1em] text-ink-2">
          {initialsOf(client.name)}
        </span>

        {/* Side by side at 390px the money block left 165px for the name and
            «Ruth Delgado» broke across two lines. On the phone the file reads
            top to bottom: who, then what he owes. */}
        <div className="flex flex-col gap-5 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between sm:gap-x-8">
          <div className="min-w-0 flex-1">
            <span className="eyebrow">Client file</span>
            <h1 className="t-record mt-2 font-black tracking-tight text-ink">{client.name}</h1>
            <p className="t-lede mt-2 text-ink-2">
              {[client.address, client.city].filter(Boolean).join(" · ") || "No address on file"}
            </p>
            <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1">
              {client.phone && (
                <a
                  href={`tel:${client.phone}`}
                  className="mono t-body inline-flex text-ink underline underline-offset-4 hover:text-sky-ink"
                >
                  {client.phone}
                </a>
              )}
              {client.email && (
                <a
                  href={`mailto:${client.email}`}
                  className="mono t-body inline-flex text-ink underline underline-offset-4 hover:text-sky-ink"
                >
                  {client.email}
                </a>
              )}
            </div>
          </div>

          {/* Question one, at 6am, with a phone in one hand: what does this
              address owe us. It is the largest thing on the file. */}
          {/* `items-start` here shrink-wrapped the action cluster, so the phone's
              one button came out 185px wide in the middle of the file. */}
          <div className="flex shrink-0 flex-col items-stretch gap-4 sm:items-end">
            {owingCents > 0 ? (
              <div className="sm:text-right">
                <div className="eyebrow" style={{ color: "var(--rose-ink)" }}>
                  Owes us
                </div>
                <div className="mt-2">
                  <Readout value={formatCents(owingCents)} size={30} tone="var(--rose-ink)" />
                </div>
              </div>
            ) : client.invoices.length > 0 ? (
              <span className="eyebrow" style={{ color: "var(--emerald-ink)" }}>
                Paid up · nothing outstanding
              </span>
            ) : (
              /* «In good standing» over a client who has never been billed was
                 the file praising somebody for a bill he never got. */
              <span className="eyebrow">Nothing billed on this file yet</span>
            )}
            <div className="actions">
              <Link href={`/projects?client=${client.id}`} className={buttonClass("primary")}>
                <Plus className="h-4 w-4" /> New job here
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* The dossier body: 7/5 on a single vertical rule; stacks below lg. */}
      <div className="grid gap-y-10 lg:grid-cols-[7fr_5fr]">
        {/* ------------------------------------------------------ LEFT: the ledgers */}
        <div className="min-w-0 space-y-10 lg:pr-8">
          <section>
            {/* The lane's tally rides LaneHead's own `count`/`unit`, the one counter
                shape the whole product prints — not a hand-rolled span that drifts a
                pixel and a word from the next screen's. */}
            <LaneHead title="History" count={client.projects.length} unit="job" />
            {history.length === 0 ? (
              /* The action for this lane is already on the file plate above —
                 two NEW JOB HERE buttons on one screen is the screen stuttering. */
              <Empty hint="Book the first stop here and the job writes itself into this history.">
                No jobs on this address yet
              </Empty>
            ) : (
              <div className="lane">
                {history.map((p) => {
                  const money = jobMoney(p);
                  const d = new Date(p.when);
                  return (
                    <Link
                      key={p.id}
                      href={`/projects/${p.id}`}
                      className="row"
                      style={{ ["--spine" as string]: spineFor(p.status) } as React.CSSProperties}
                    >
                      <div className="grid grid-cols-[44px_1fr] gap-x-4 md:grid-cols-[56px_1fr]">
                        {/* The date rail — when this line was written into the file. */}
                        <div>
                          <div className="mono t-record font-bold tabular-nums text-ink-2">
                            {String(d.getDate()).padStart(2, "0")}
                          </div>
                          <div className="eyebrow mt-1">
                            {d.toLocaleString("en-CA", { month: "short" }).toUpperCase()}
                          </div>
                          <div className="mono t-micro mt-1 tabular-nums text-ink-3">
                            {d.getFullYear()}
                          </div>
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-baseline justify-between gap-3">
                            <p className="t-row min-w-0 truncate font-bold text-ink">{p.title}</p>
                            {money && (
                              <span className="shrink-0 whitespace-nowrap">
                                {money.est && <span className="eyebrow mr-1.5">EST</span>}
                                <Money cents={money.cents} className="t-body font-medium" />
                              </span>
                            )}
                          </div>
                          <div className="mt-1.5 flex flex-wrap items-baseline gap-x-3 gap-y-1">
                            <span className="eyebrow" style={{ color: textToneFor(p.status) }}>
                              {p.status.replace(/_/g, " ")}
                            </span>
                            {p.jobType && (
                              <span className="t-meta text-ink-3">{p.jobType}</span>
                            )}
                          </div>
                        </div>
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}
          </section>

          <section>
            <LaneHead title="Paper" count={paper.length} unit="invoice" />
            {paper.length === 0 ? (
              <Empty hint="An invoice comes off an accepted estimate on the job, with the same lines on it.">
                Nothing has been billed to this client
              </Empty>
            ) : (
              <div className="lane">
                {paper.map((inv) => {
                  const late = isOverdue(inv);
                  return (
                    <Link
                      key={inv.id}
                      href={`/invoices/${inv.id}`}
                      className="row !py-3"
                      style={
                        {
                          ["--spine" as string]: late ? "var(--rose)" : spineFor(inv.status),
                        } as React.CSSProperties
                      }
                    >
                      <div className="flex items-baseline gap-3">
                        <span className="eyebrow shrink-0 font-bold text-ink-2">
                          {inv.number}
                        </span>
                        <span
                          className="eyebrow shrink-0"
                          style={{ color: late ? "var(--rose-ink)" : textToneFor(inv.status) }}
                        >
                          {late ? lateWord(daysOverdue(inv), true) : inv.status}
                        </span>
                        <span className="dotlead" aria-hidden="true" />
                        <Money
                          cents={inv.totalCents}
                          className="t-body shrink-0 font-medium"
                          tone={late ? "var(--rose-ink)" : undefined}
                        />
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}
          </section>

          {client.notes && (
            <section className="border-t border-line pt-3">
              <div className="eyebrow">Notes on file</div>
              <p className="measure t-body mt-2 leading-relaxed text-ink-2">{client.notes}</p>
            </section>
          )}
        </div>

        {/* --------------------------------------------- RIGHT: the standing facts */}
        <div className="min-w-0 space-y-10 lg:border-l lg:border-line lg:pl-8">
          <section>
            <LaneHead title="Money position" />
            <div className="lane">
              <div className="flex flex-wrap gap-x-10 gap-y-4 pt-4">
                <div>
                  <div className="eyebrow">Owing</div>
                  <div className="mt-2">
                    <Readout
                      value={formatCents(owingCents)}
                      size={22}
                      tone={owingCents > 0 ? "var(--rose-ink)" : "var(--ink)"}
                    />
                  </div>
                </div>
                <div>
                  <div className="eyebrow">Collected to date</div>
                  <div className="mt-2">
                    {/* Emerald is a claim about money that came in. A zero in
                        emerald called an empty file good news. */}
                    <Readout
                      value={formatCents(client.totals.collectedCents)}
                      size={22}
                      tone={
                        client.totals.collectedCents > 0 ? "var(--emerald-ink)" : "var(--ink)"
                      }
                    />
                  </div>
                </div>
              </div>
              {client.totals.costsCents > 0 && (
                <p className="eyebrow mt-4">
                  Our costs <Money cents={client.totals.costsCents} className="t-meta" />
                </p>
              )}
            </div>
          </section>

          <section>
            <LaneHead
              title="Iron on site"
              right={
                <Button variant="quiet" onClick={() => setShowEquip((v) => !v)}>
                  {showEquip ? <X className="h-3 w-3" /> : <Plus className="h-3 w-3" />}
                  {showEquip ? "Close" : "Add unit"}
                </Button>
              }
            />

            {showEquip && (
              <Plate className="mb-4 p-4">
                <div className="eyebrow">New unit on this address</div>
                <form onSubmit={addEquipment} className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <Field id="eq-kind" label="Kind">
                    {(f) => (
                      <select
                        {...f}
                        value={equipForm.kind}
                        onChange={(e) => setEquipForm({ ...equipForm, kind: e.target.value })}
                        className={cn(f.className, "mono uppercase tracking-[0.06em]")}
                      >
                        {KINDS.map((k) => (
                          <option key={k} value={k}>
                            {k.replace(/_/g, " ")}
                          </option>
                        ))}
                      </select>
                    )}
                  </Field>
                  <Field id="eq-location" label="Location">
                    {(f) => (
                      <input
                        {...f}
                        value={equipForm.location}
                        onChange={(e) => setEquipForm({ ...equipForm, location: e.target.value })}
                        placeholder="Basement, roof, utility room…"
                      />
                    )}
                  </Field>
                  <Field id="eq-brand" label="Brand">
                    {(f) => (
                      <input
                        {...f}
                        value={equipForm.brand}
                        onChange={(e) => setEquipForm({ ...equipForm, brand: e.target.value })}
                      />
                    )}
                  </Field>
                  <Field id="eq-model" label="Model">
                    {(f) => (
                      <input
                        {...f}
                        value={equipForm.model}
                        onChange={(e) => setEquipForm({ ...equipForm, model: e.target.value })}
                        className={cn(f.className, "mono")}
                      />
                    )}
                  </Field>
                  <Field
                    id="eq-serial"
                    label="Serial"
                    hint="The number the supplier asks for on the phone."
                  >
                    {(f) => (
                      <input
                        {...f}
                        value={equipForm.serial}
                        onChange={(e) => setEquipForm({ ...equipForm, serial: e.target.value })}
                        className={cn(f.className, "mono")}
                      />
                    )}
                  </Field>
                  <Field id="eq-installed" label="Installed">
                    {(f) => (
                      <input
                        {...f}
                        type="date"
                        value={equipForm.installedAt}
                        onChange={(e) =>
                          setEquipForm({ ...equipForm, installedAt: e.target.value })
                        }
                        className={cn(f.className, "mono")}
                      />
                    )}
                  </Field>
                  <Field id="eq-warranty" label="Warranty until">
                    {(f) => (
                      <input
                        {...f}
                        type="date"
                        value={equipForm.warrantyUntil}
                        onChange={(e) =>
                          setEquipForm({ ...equipForm, warrantyUntil: e.target.value })
                        }
                        className={cn(f.className, "mono")}
                      />
                    )}
                  </Field>
                  <Field id="eq-notes" label="Notes" className="sm:col-span-2">
                    {(f) => (
                      <input
                        {...f}
                        value={equipForm.notes}
                        onChange={(e) => setEquipForm({ ...equipForm, notes: e.target.value })}
                      />
                    )}
                  </Field>
                  <div className="actions sm:col-span-2">
                    <Button type="submit" variant="primary">
                      Save unit
                    </Button>
                    <Button type="button" variant="ghost" onClick={() => setShowEquip(false)}>
                      Cancel
                    </Button>
                  </div>
                </form>
              </Plate>
            )}

            {client.equipment.length === 0 ? (
              <Empty hint="The furnace, the AC, the water heater — put them on the file once and the crew reads make, model and serial before the drive.">
                No units on file at this address
              </Empty>
            ) : (
              <div className="lane">
                {client.equipment.map((eq) => {
                  const w = eq.warrantyUntil ? warrantyTerm(eq.warrantyUntil) : null;
                  return (
                    <div
                      key={eq.id}
                      className="row"
                      style={
                        {
                          ["--spine" as string]: w?.live ? "var(--emerald)" : "var(--slate)",
                        } as React.CSSProperties
                      }
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <Chip>{eq.kind.replace(/_/g, " ")}</Chip>
                            {eq.location && (
                              <span className="t-meta text-ink-2">{eq.location}</span>
                            )}
                          </div>
                          <p className="t-row mt-2 font-bold text-ink">
                            {[eq.brand, eq.model].filter(Boolean).join(" ") || "Unspecified unit"}
                          </p>
                        </div>
                        <button
                          onClick={() => removeEquipment(eq.id)}
                          /* A 14px icon is a 14px target on the desk; the box
                             around it is the row-scale 26. */
                          className="-m-1.5 shrink-0 p-1.5 text-ink-3 transition-colors duration-fast ease-instrument hover:text-rose"
                          aria-label={`Remove ${[eq.kind.replace(/_/g, " "), eq.brand, eq.model]
                            .filter(Boolean)
                            .join(" ")}`}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>

                      {/* What the tech reads out over the phone to the supplier —
                          it used to be the smallest type in the lane. */}
                      {eq.serial && (
                        <p className="mt-2">
                          <span className="eyebrow mr-2">S/N</span>
                          <Num className="t-body text-ink">{eq.serial}</Num>
                        </p>
                      )}

                      {/* The unit's own two facts, labelled like the plate on its
                          side. Warranty used to take two lines to say one thing. */}
                      <div className="mt-2 grid grid-cols-[72px_1fr] gap-x-3 gap-y-1.5">
                        {eq.installedAt && (
                          <>
                            <span className="eyebrow">Installed</span>
                            <Stamp date={eq.installedAt} className="t-meta text-ink-2" />
                          </>
                        )}
                        {w && eq.warrantyUntil && (
                          /* Covered or out of warranty differs by the WORD, by the
                             "!" a dead warranty carries, and by the spine — the
                             colour is the last of the four, because at arm's
                             length in a basement it is the first one to go. */
                          <>
                            <span className="eyebrow">Warranty</span>
                            <span>
                              {/* The verdict on its own line, in the words a tech
                                  says at the door; the dates underneath it. */}
                              <span
                                className="mono t-meta block font-bold uppercase tracking-[0.04em]"
                                style={{
                                  color: w.live ? "var(--emerald-ink)" : "var(--rose-ink)",
                                }}
                              >
                                {w.live ? `Covered · ${w.term} left` : `! Out of warranty`}
                              </span>
                              <span className="mono t-meta block text-ink-3">
                                {w.live ? "runs to " : `ended `}
                                <Stamp date={eq.warrantyUntil} />
                                {w.live ? "" : ` · ${w.term} ago`}
                              </span>
                            </span>
                          </>
                        )}
                      </div>
                      {eq.notes && <p className="t-meta mt-2 text-ink-2">{eq.notes}</p>}
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {/* The office's lane. A tech is served an empty list by the API, so for
              him this section does not exist rather than reporting a falsehood. */}
          {isAdmin && (
            <section>
              <LaneHead
                title="Service contracts"
                count={client.contracts?.length ? client.contracts.length : undefined}
                unit="contract"
              />
              {!client.contracts || client.contracts.length === 0 ? (
                <Empty
                  hint="A contract books its own seasonal visits onto the board and bills them."
                  action={
                    <Link href="/contracts" className={buttonClass("ghost")}>
                      Start a contract
                    </Link>
                  }
                >
                  No maintenance contract on this address
                </Empty>
              ) : (
                <div className="lane">
                  {client.contracts.map((ct) => {
                    const next = nextVisitLabel(ct.visitMonths);
                    return (
                      <Link
                        key={ct.id}
                        href="/contracts"
                        className="row"
                        style={
                          {
                            ["--spine" as string]: ct.active ? "var(--sky)" : "var(--slate)",
                          } as React.CSSProperties
                        }
                      >
                        <div className="flex items-baseline justify-between gap-3">
                          <p className="t-row min-w-0 truncate font-bold text-ink">{ct.name}</p>
                          <span className="shrink-0 whitespace-nowrap">
                            <Money
                              cents={ct.pricePerVisitCents}
                              className="t-body font-medium"
                            />
                            <span className="eyebrow ml-1.5">/ visit</span>
                          </span>
                        </div>
                        <div className="mt-1.5">
                          {ct.active ? (
                            next && (
                              <span
                                className="mono t-meta font-bold tracking-[0.06em]"
                                style={{ color: "var(--amber-ink)" }}
                              >
                                NEXT VISIT {next}
                              </span>
                            )
                          ) : (
                            <span className="mono t-meta tracking-[0.06em] text-ink-3">
                              PAUSED
                            </span>
                          )}
                        </div>
                      </Link>
                    );
                  })}
                </div>
              )}
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
