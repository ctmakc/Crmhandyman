"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Plus, Trash2, X } from "lucide-react";
import { formatCurrency, formatDate, cn } from "@/lib/utils";
import {
  Plate,
  Empty,
  buttonClass,
  spineFor,
  textToneFor,
  Skeleton,
} from "@/components/ui/primitives";
import { toast } from "@/components/ui/Toaster";
import { isOverdue, daysOverdue } from "@/lib/invoice-state";

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

interface ClientInvoice {
  id: string;
  number: string;
  status: string;
  total: number;
  amountPaid: number;
  dueDate: string | null;
  issuedAt: string;
  projectTitle: string;
}

interface ClientRecord {
  id: string;
  name: string;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  city?: string | null;
  notes?: string | null;
  equipment: Equipment[];
  leads: Array<{ id: string; name: string; source: string; status: string; createdAt: string }>;
  projects: Array<{
    id: string;
    title: string;
    status: string;
    address: string;
    jobType?: string | null;
    scheduledDate?: string | null;
    completedDate?: string | null;
    createdAt: string;
  }>;
  invoices: ClientInvoice[];
  totals: { owing: number; collected: number; costs: number; lifetime: number };
}

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

const TABS = ["jobs", "equipment", "invoices"] as const;
type Tab = (typeof TABS)[number];

export default function ClientDetailPage({ params }: { params: { id: string } }) {
  const [client, setClient] = useState<ClientRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>("jobs");
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
    if (res.ok) setClient(await res.json());
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
  const openJobs = client.projects.filter(
    (p) => p.status === "SCHEDULED" || p.status === "IN_PROGRESS"
  ).length;

  return (
    <div className="mx-auto max-w-4xl space-y-6 pb-24 md:pb-0">
      <Link href="/clients" className="eyebrow inline-flex items-center gap-1.5 hover:text-ink">
        <ArrowLeft className="h-3.5 w-3.5" /> All clients
      </Link>

      <div
        className="plate px-5 py-5"
        style={{
          borderLeft: `4px solid ${
            client.totals.owing > 0.005 ? "var(--rose)" : openJobs > 0 ? "var(--amber)" : "var(--emerald)"
          }`,
        }}
      >
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <span className="eyebrow">Client</span>
            <h1 className="mt-1.5 text-[26px] font-black leading-none tracking-tight text-ink">
              {client.name}
            </h1>
            <p className="mt-2 text-[14px] text-ink-2">
              {[client.address, client.city].filter(Boolean).join(", ") || "No address on file"}
            </p>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
              {client.phone && (
                <a
                  href={`tel:${client.phone}`}
                  className="mono text-[13px] text-ink underline underline-offset-4"
                >
                  {client.phone}
                </a>
              )}
              {client.email && (
                <a
                  href={`mailto:${client.email}`}
                  className="mono text-[13px] text-ink underline underline-offset-4"
                >
                  {client.email}
                </a>
              )}
            </div>
          </div>
          <Link href={`/projects?client=${client.id}`} className={buttonClass("primary")}>
            <Plus className="h-4 w-4" /> New job here
          </Link>
        </div>

        {client.notes && (
          <p className="mt-4 border-t border-line pt-3 text-[13px] text-ink-2">{client.notes}</p>
        )}
      </div>

      <div className="grid grid-cols-3 border border-line bg-plate">
        {[
          {
            label: "Owing now",
            value: formatCurrency(client.totals.owing),
            tone: client.totals.owing > 0.005 ? "var(--rose-ink)" : "var(--emerald)",
          },
          { label: "Lifetime paid", value: formatCurrency(client.totals.lifetime), tone: "var(--emerald-ink)" },
          { label: "Our costs", value: formatCurrency(client.totals.costs) },
        ].map((r) => (
          <div key={r.label} className="border-r border-line px-4 py-4 last:border-r-0">
            <div className="eyebrow">{r.label}</div>
            <p
              className="mono mt-2.5 text-[18px] font-bold leading-none md:text-[22px]"
              style={{ color: r.tone || "var(--ink)" }}
            >
              {r.value}
            </p>
          </div>
        ))}
      </div>

      <div className="flex gap-6 border-b border-line">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              "-mb-px border-b-2 pb-2.5 text-[12px] font-bold uppercase tracking-[0.08em] transition-colors duration-[140ms] ease-instrument",
              tab === t ? "border-navy-900 text-ink" : "border-transparent text-ink-3 hover:text-ink-2"
            )}
          >
            {t}{" "}
            <span className="mono opacity-60">
              {t === "jobs"
                ? client.projects.length
                : t === "equipment"
                  ? client.equipment.length
                  : client.invoices.length}
            </span>
          </button>
        ))}
      </div>

      {tab === "jobs" && (
        <div className="space-y-2.5">
          {client.projects.length === 0 ? (
            <Empty>No jobs on this address yet</Empty>
          ) : (
            client.projects.map((p) => (
              <Link
                key={p.id}
                href={`/projects/${p.id}`}
                className="ticket block px-4 py-3"
                style={{ ["--spine" as string]: spineFor(p.status) } as React.CSSProperties}
              >
                <div className="flex items-baseline justify-between gap-3">
                  <span className="mono text-[11px] tracking-[0.08em] text-ink-3">
                    WO-{new Date(p.createdAt).getFullYear()}-{p.id.slice(-4).toUpperCase()}
                  </span>
                  <span className="eyebrow" style={{ color: textToneFor(p.status) }}>
                    {p.status.replace("_", " ")}
                  </span>
                </div>
                <p className="mt-1.5 text-[15px] font-bold leading-tight text-ink">{p.title}</p>
                <p className="text-[13px] text-ink-2">
                  {[p.jobType, p.completedDate ? `done ${formatDate(p.completedDate)}` : p.scheduledDate ? `booked ${formatDate(p.scheduledDate)}` : null]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              </Link>
            ))
          )}
        </div>
      )}

      {tab === "equipment" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-[13px] text-ink-2">
              What is installed at this address — a tech should know before the drive.
            </p>
            <button onClick={() => setShowEquip((v) => !v)} className={buttonClass("ghost")}>
              {showEquip ? <X className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
              {showEquip ? "Close" : "Add unit"}
            </button>
          </div>

          {showEquip && (
            <Plate className="p-5">
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
                    onChange={(e) => setEquipForm({ ...equipForm, warrantyUntil: e.target.value })}
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
            <div className="space-y-2.5">
              {client.equipment.map((eq) => {
                const underWarranty =
                  eq.warrantyUntil && new Date(eq.warrantyUntil) > new Date();
                return (
                  <div
                    key={eq.id}
                    className="ticket ticket-hover px-4 py-3"
                    style={
                      {
                        ["--spine"]: underWarranty ? "var(--emerald-ink)" : "var(--slate)",
                      } as React.CSSProperties
                    }
                  >
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="eyebrow">{eq.kind.replace(/_/g, " ")}</span>
                      <div className="flex items-center gap-3">
                        {eq.warrantyUntil && (
                          <span
                            className="mono text-[11px] tracking-[0.06em]"
                            style={{
                              color: underWarranty ? "var(--emerald-ink)" : "var(--ink-3)",
                            }}
                          >
                            {underWarranty ? "WARRANTY TO " : "EXPIRED "}
                            {formatDate(eq.warrantyUntil)}
                          </span>
                        )}
                        <button
                          onClick={() => removeEquipment(eq.id)}
                          className="text-ink-3 transition-colors hover:text-rose"
                          aria-label="Remove unit"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                    <p className="mt-1.5 text-[15px] font-bold leading-tight text-ink">
                      {[eq.brand, eq.model].filter(Boolean).join(" ") || "Unspecified unit"}
                    </p>
                    <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1">
                      {eq.serial && (
                        <span className="mono text-[12px] text-ink-2">S/N {eq.serial}</span>
                      )}
                      {eq.location && (
                        <span className="text-[13px] text-ink-2">{eq.location}</span>
                      )}
                      {eq.installedAt && (
                        <span className="mono text-[12px] text-ink-3">
                          INSTALLED {formatDate(eq.installedAt)}
                        </span>
                      )}
                    </div>
                    {eq.notes && <p className="mt-1.5 text-[13px] text-ink-2">{eq.notes}</p>}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {tab === "invoices" && (
        <div className="space-y-2.5">
          {client.invoices.length === 0 ? (
            <Empty>Nothing has been billed to this client</Empty>
          ) : (
            client.invoices.map((inv) => {
              const late = isOverdue(inv);
              return (
                <Link
                  key={inv.id}
                  href={`/invoices/${inv.id}`}
                  className="ticket block px-4 py-3"
                  style={
                    {
                      ["--spine"]: late ? "var(--rose)" : spineFor(inv.status),
                    } as React.CSSProperties
                  }
                >
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="mono text-[11px] font-bold tracking-[0.08em] text-ink-2">
                      {inv.number}
                    </span>
                    <span
                      className="eyebrow"
                      style={{ color: late ? "var(--rose-ink)" : textToneFor(inv.status) }}
                    >
                      {late ? `OVERDUE · ${daysOverdue(inv)}D` : inv.status}
                    </span>
                  </div>
                  <div className="mt-1.5 flex items-end justify-between gap-4">
                    <p className="min-w-0 truncate text-[13px] text-ink-2">{inv.projectTitle}</p>
                    <span className="mono shrink-0 text-[16px] font-medium text-ink">
                      {formatCurrency(inv.total)}
                    </span>
                  </div>
                </Link>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
