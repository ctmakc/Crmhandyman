"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Plus, Trash2, X } from "lucide-react";
import { cn, formatDate } from "@/lib/utils";
import { formatCents, inCents, type InCents } from "@/lib/money";
import {
  Plate,
  Empty,
  buttonClass,
  spineFor,
  textToneFor,
  Skeleton,
  LaneHead,
  Readout,
  Money,
} from "@/components/ui/primitives";
import { toast } from "@/components/ui/Toaster";
import { isOverdue, daysOverdue } from "@/lib/invoice-state";

/* --------------------------------------------------------------------------
   THE DOSSIER (DESIGN.md revision 3, deepened): one client file, opened flat.
   Header = the file-card plate (paper you could hold). Body = asymmetric
   7/5 split on a single vertical rule: the HISTORY and PAPER ledgers on the
   left, the MONEY / IRON / SERVICE PLAN lanes on the right. No tabs, no
   boxed stat grid — ruled lanes only.
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

/** What a job line is worth on the ledger: billed money first, the estimate as fallback. */
function jobMoney(p: ClientProject): { cents: number; est: boolean } | null {
  if (p.invoices.length > 0)
    return { cents: p.invoices.reduce((s, i) => s + i.totalCents, 0), est: false };
  const est = p.estimates.find((e) => e.status === "ACCEPTED") ?? p.estimates[0];
  return est ? { cents: est.totalCents, est: true } : null;
}

export default function ClientDetailPage({ params }: { params: { id: string } }) {
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
      toast("Equipment recorded");
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
      toast("Could not save the unit", "bad");
    }
  }

  async function removeEquipment(id: string) {
    await fetch(`/api/clients/${params.id}/equipment?equipmentId=${id}`, { method: "DELETE" });
    toast("Equipment removed");
    load();
  }

  if (loading) return <Skeleton lines={5} />;
  if (!client) return <Empty>Client not found</Empty>;

  const field = "w-full mt-1.5 px-3 py-2 text-[13px]";
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
    <div className="mx-auto max-w-5xl space-y-7 pb-24 md:pb-0">
      <Link href="/clients" className="eyebrow inline-flex items-center gap-1.5 hover:text-ink">
        <ArrowLeft className="h-3.5 w-3.5" /> All clients
      </Link>

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
        <span className="mono absolute left-5 top-0 -translate-y-1/2 rounded-t border border-b-0 border-line bg-plate px-1.5 py-[3px] text-[10px] font-medium uppercase leading-none tracking-[0.1em] text-ink-2">
          {initialsOf(client.name)}
        </span>

        <div className="flex flex-wrap items-start justify-between gap-x-8 gap-y-5">
          <div className="min-w-0 flex-1">
            <span className="eyebrow">Client file</span>
            <h1 className="mt-1.5 text-[26px] font-black leading-none tracking-tight text-ink">
              {client.name}
            </h1>
            <p className="mt-2 text-[14px] text-ink-2">
              {[client.address, client.city].filter(Boolean).join(" · ") || "No address on file"}
            </p>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
              {client.phone && (
                <a
                  href={`tel:${client.phone}`}
                  className="mono text-[13px] text-ink underline underline-offset-4 hover:text-sky-ink"
                >
                  {client.phone}
                </a>
              )}
              {client.email && (
                <a
                  href={`mailto:${client.email}`}
                  className="mono text-[13px] text-ink underline underline-offset-4 hover:text-sky-ink"
                >
                  {client.email}
                </a>
              )}
            </div>
          </div>

          {/* The one dominant readout: what this file owes, or a clean bill. */}
          <div className="flex shrink-0 flex-col items-start gap-3.5 sm:items-end">
            {owingCents > 0 ? (
              <div className="sm:text-right">
                <div className="eyebrow" style={{ color: "var(--rose-ink)" }}>
                  Owes us
                </div>
                <div className="mt-1.5">
                  <Readout value={formatCents(owingCents)} size={30} tone="var(--rose-ink)" />
                </div>
              </div>
            ) : (
              <span className="eyebrow" style={{ color: "var(--emerald-ink)" }}>
                In good standing
              </span>
            )}
            <Link href={`/projects?client=${client.id}`} className={buttonClass("primary")}>
              <Plus className="h-4 w-4" /> New job here
            </Link>
          </div>
        </div>
      </div>

      {/* The dossier body: 7/5 on a single vertical rule; stacks below lg. */}
      <div className="grid gap-y-10 lg:grid-cols-[7fr_5fr]">
        {/* ------------------------------------------------------ LEFT: the ledgers */}
        <div className="min-w-0 space-y-10 lg:pr-8">
          <section>
            <LaneHead
              title="History"
              right={
                <span className="mono text-[11px] text-ink-3">
                  {client.projects.length} {client.projects.length === 1 ? "JOB" : "JOBS"}
                </span>
              }
            />
            {history.length === 0 ? (
              <Empty>No jobs on this address yet</Empty>
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
                      <div className="grid grid-cols-[44px_1fr] gap-x-3.5 md:grid-cols-[56px_1fr]">
                        {/* The date rail — when this line was written into the file. */}
                        <div className="pt-0.5">
                          <div className="mono text-[16px] font-bold leading-none tabular-nums text-ink-2">
                            {String(d.getDate()).padStart(2, "0")}
                          </div>
                          <div className="eyebrow mt-1">
                            {d.toLocaleString("en-CA", { month: "short" }).toUpperCase()}
                          </div>
                          <div className="mono mt-0.5 text-[10px] leading-none tabular-nums text-ink-3">
                            {d.getFullYear()}
                          </div>
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-baseline justify-between gap-3">
                            <p className="min-w-0 truncate text-[14px] font-bold leading-tight text-ink">
                              {p.title}
                            </p>
                            {money && (
                              <span className="mono shrink-0 text-[13px] font-medium tabular-nums text-ink">
                                {money.est && (
                                  <span className="mr-1 text-[9px] tracking-[0.08em] text-ink-3">
                                    EST
                                  </span>
                                )}
                                {formatCents(money.cents)}
                              </span>
                            )}
                          </div>
                          <div className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
                            <span className="eyebrow" style={{ color: textToneFor(p.status) }}>
                              {p.status.replace(/_/g, " ")}
                            </span>
                            {p.jobType && (
                              <span className="text-[12px] text-ink-3">{p.jobType}</span>
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
            <LaneHead
              title="Paper"
              right={
                <span className="mono text-[11px] text-ink-3">
                  {paper.length} {paper.length === 1 ? "INVOICE" : "INVOICES"}
                </span>
              }
            />
            {paper.length === 0 ? (
              <Empty>Nothing has been billed to this client</Empty>
            ) : (
              <div className="lane">
                {paper.map((inv) => {
                  const late = isOverdue(inv);
                  return (
                    <Link
                      key={inv.id}
                      href={`/invoices/${inv.id}`}
                      className="row !py-2.5"
                      style={
                        {
                          ["--spine" as string]: late ? "var(--rose)" : spineFor(inv.status),
                        } as React.CSSProperties
                      }
                    >
                      <div className="flex items-baseline gap-3">
                        <span className="mono shrink-0 text-[11px] font-bold tracking-[0.08em] text-ink-2">
                          {inv.number}
                        </span>
                        <span
                          className="eyebrow shrink-0"
                          style={{ color: late ? "var(--rose-ink)" : textToneFor(inv.status) }}
                        >
                          {late ? `OVERDUE · ${daysOverdue(inv)}D` : inv.status}
                        </span>
                        <span className="dotlead" aria-hidden="true" />
                        <Money
                          cents={inv.totalCents}
                          className="shrink-0 text-[13px]"
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
              <p className="mt-2 max-w-[62ch] text-[13px] leading-relaxed text-ink-2">
                {client.notes}
              </p>
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
                  <div className="eyebrow">Owing now</div>
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
                    <Readout
                      value={formatCents(client.totals.collectedCents)}
                      size={22}
                      tone="var(--emerald-ink)"
                    />
                  </div>
                </div>
              </div>
              {client.totals.costsCents > 0 && (
                <p className="mono mt-3.5 text-[12px] tabular-nums text-ink-3">
                  OUR COSTS {formatCents(client.totals.costsCents)}
                </p>
              )}
            </div>
          </section>

          <section>
            <LaneHead
              title="Iron on site"
              right={
                <button
                  onClick={() => setShowEquip((v) => !v)}
                  className={cn(buttonClass("ghost"), "!px-2.5 !py-1 !text-[11px]")}
                >
                  {showEquip ? <X className="h-3 w-3" /> : <Plus className="h-3 w-3" />}
                  {showEquip ? "Close" : "Add unit"}
                </button>
              }
            />

            {showEquip && (
              <Plate className="mb-4 p-4">
                <div className="eyebrow">New equipment record</div>
                <form onSubmit={addEquipment} className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label className="eyebrow">Kind</label>
                    <select
                      value={equipForm.kind}
                      onChange={(e) => setEquipForm({ ...equipForm, kind: e.target.value })}
                      className={`${field} mono uppercase tracking-[0.06em]`}
                    >
                      {KINDS.map((k) => (
                        <option key={k} value={k}>
                          {k.replace(/_/g, " ")}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="eyebrow">Location</label>
                    <input
                      value={equipForm.location}
                      onChange={(e) => setEquipForm({ ...equipForm, location: e.target.value })}
                      placeholder="Basement, roof, utility room…"
                      className={field}
                    />
                  </div>
                  <div>
                    <label className="eyebrow">Brand</label>
                    <input
                      value={equipForm.brand}
                      onChange={(e) => setEquipForm({ ...equipForm, brand: e.target.value })}
                      className={field}
                    />
                  </div>
                  <div>
                    <label className="eyebrow">Model</label>
                    <input
                      value={equipForm.model}
                      onChange={(e) => setEquipForm({ ...equipForm, model: e.target.value })}
                      className={`${field} mono`}
                    />
                  </div>
                  <div>
                    <label className="eyebrow">Serial</label>
                    <input
                      value={equipForm.serial}
                      onChange={(e) => setEquipForm({ ...equipForm, serial: e.target.value })}
                      className={`${field} mono`}
                    />
                  </div>
                  <div>
                    <label className="eyebrow">Installed</label>
                    <input
                      type="date"
                      value={equipForm.installedAt}
                      onChange={(e) => setEquipForm({ ...equipForm, installedAt: e.target.value })}
                      className={`${field} mono`}
                    />
                  </div>
                  <div>
                    <label className="eyebrow">Warranty until</label>
                    <input
                      type="date"
                      value={equipForm.warrantyUntil}
                      onChange={(e) =>
                        setEquipForm({ ...equipForm, warrantyUntil: e.target.value })
                      }
                      className={`${field} mono`}
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="eyebrow">Notes</label>
                    <input
                      value={equipForm.notes}
                      onChange={(e) => setEquipForm({ ...equipForm, notes: e.target.value })}
                      className={field}
                    />
                  </div>
                  <div className="flex gap-2 sm:col-span-2">
                    <button type="submit" className={buttonClass("primary")}>
                      Save unit
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowEquip(false)}
                      className={buttonClass("ghost")}
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              </Plate>
            )}

            {client.equipment.length === 0 ? (
              <Empty>No equipment recorded at this address</Empty>
            ) : (
              <div className="lane">
                {client.equipment.map((eq) => {
                  const underWarranty =
                    eq.warrantyUntil && new Date(eq.warrantyUntil) > new Date();
                  return (
                    <div
                      key={eq.id}
                      className="row"
                      style={
                        {
                          ["--spine" as string]: underWarranty
                            ? "var(--emerald)"
                            : "var(--slate)",
                        } as React.CSSProperties
                      }
                    >
                      <div className="flex items-baseline justify-between gap-3">
                        <span className="eyebrow">{eq.kind.replace(/_/g, " ")}</span>
                        <button
                          onClick={() => removeEquipment(eq.id)}
                          className="text-ink-3 transition-colors hover:text-rose"
                          aria-label="Remove unit"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                      <p className="mt-1 text-[14px] font-bold leading-tight text-ink">
                        {[eq.brand, eq.model].filter(Boolean).join(" ") || "Unspecified unit"}
                      </p>
                      <div className="mt-1 flex flex-wrap gap-x-3.5 gap-y-1">
                        {eq.serial && (
                          <span className="mono text-[11px] text-ink-2">S/N {eq.serial}</span>
                        )}
                        {eq.location && (
                          <span className="text-[12px] text-ink-2">{eq.location}</span>
                        )}
                      </div>
                      <div className="mt-1 flex flex-wrap gap-x-3.5 gap-y-1">
                        {eq.installedAt && (
                          <span className="mono text-[11px] text-ink-3">
                            INSTALLED {formatDate(eq.installedAt)}
                          </span>
                        )}
                        {eq.warrantyUntil && (
                          <span
                            className="mono text-[11px]"
                            style={{
                              color: underWarranty ? "var(--emerald-ink)" : "var(--rose-ink)",
                            }}
                          >
                            {underWarranty ? "WARRANTY TO " : "WARRANTY EXPIRED "}
                            {formatDate(eq.warrantyUntil)}
                          </span>
                        )}
                      </div>
                      {eq.notes && <p className="mt-1 text-[12px] text-ink-2">{eq.notes}</p>}
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          <section>
            <LaneHead
              title="Service plans"
              right={
                client.contracts?.length > 0 ? (
                  <span className="mono text-[11px] text-ink-3">{client.contracts.length}</span>
                ) : undefined
              }
            />
            {!client.contracts || client.contracts.length === 0 ? (
              <Empty>No maintenance plan on this address</Empty>
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
                        <p className="min-w-0 truncate text-[14px] font-bold leading-tight text-ink">
                          {ct.name}
                        </p>
                        <span className="mono shrink-0 text-[12px] font-medium tabular-nums text-ink">
                          {formatCents(ct.pricePerVisitCents)}
                          <span className="text-[10px] text-ink-3"> / VISIT</span>
                        </span>
                      </div>
                      <div className="mt-1">
                        {ct.active ? (
                          next && (
                            <span
                              className="mono text-[11px] tracking-[0.06em]"
                              style={{ color: "var(--amber-ink)" }}
                            >
                              NEXT {next}
                            </span>
                          )
                        ) : (
                          <span className="mono text-[11px] tracking-[0.06em] text-ink-3">
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
        </div>
      </div>
    </div>
  );
}
