"use client";

import { useEffect, useState, use } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Plus, Trash2, Printer, Send, Scissors, Calculator } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { PageHead, Empty, buttonClass, spineFor, textToneFor } from "@/components/ui/primitives";
import { toast } from "@/components/ui/Toaster";
import {
  JOB_TEMPLATES,
  PRICE_ITEMS,
  quoteMove,
  crewFor,
  baseHoursFor,
  type JobTemplate,
  type MoveInputs,
} from "@/lib/price-book";
import { SPLIT_PLANS } from "@/lib/margin";

interface LineItem {
  description: string;
  qty: number;
  unit: string;
  unitPrice: number;
}

interface Estimate {
  id: string;
  status: string;
  lineItems: string;
  subtotal: number;
  tax: number;
  total: number;
  notes?: string;
  createdAt: string;
}

interface Project {
  id: string;
  title: string;
  clientName: string;
  email?: string;
}

export default function EstimatePage(props: { params: Promise<{ id: string }> }) {
  const params = use(props.params);
  const router = useRouter();
  const [project, setProject] = useState<Project | null>(null);
  const [estimates, setEstimates] = useState<Estimate[]>([]);
  const [creating, setCreating] = useState(false);
  const [taxRate, setTaxRate] = useState(0.13);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [issuing, setIssuing] = useState<string | null>(null);
  const [split, setSplit] = useState("full");
  const [lineItems, setLineItems] = useState<LineItem[]>([
    { description: "", qty: 1, unit: "hr", unitPrice: 0 },
  ]);
  const [showCalc, setShowCalc] = useState(false);
  const [move, setMove] = useState<MoveInputs>({
    bedrooms: 2,
    flights: 0,
    travelHours: 1,
    packing: true,
  });

  /** A whole job in one click — the price book, not forty keystrokes. */
  function applyTemplate(t: JobTemplate) {
    setLineItems(t.lineItems.map((l) => ({ ...l })));
    setShowCalc(false);
    toast(`${t.label} loaded — ${t.lineItems.length} lines`);
  }

  async function fetchData() {
    const [projRes, estRes] = await Promise.all([
      fetch(`/api/projects/${params.id}`),
      fetch(`/api/projects/${params.id}/estimate`),
    ]);
    setProject(await projRes.json());
    setEstimates(await estRes.json());
  }

  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const subtotal = lineItems.reduce((s, item) => s + item.qty * item.unitPrice, 0);
  const tax = subtotal * taxRate;
  const total = subtotal + tax;

  function updateLineItem(index: number, field: keyof LineItem, value: string | number) {
    const updated = [...lineItems];
    updated[index] = { ...updated[index], [field]: value };
    setLineItems(updated);
  }

  function addLineItem() {
    setLineItems([...lineItems, { description: "", qty: 1, unit: "hr", unitPrice: 0 }]);
  }

  function removeLineItem(index: number) {
    setLineItems(lineItems.filter((_, i) => i !== index));
  }

  async function handleSave() {
    setSaving(true);
    await fetch(`/api/projects/${params.id}/estimate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lineItems, taxRate, notes }),
    });
    setSaving(false);
    setCreating(false);
    setLineItems([{ description: "", qty: 1, unit: "hr", unitPrice: 0 }]);
    setNotes("");
    toast("Estimate saved");
    fetchData();
  }

  async function handleUpdateStatus(estimateId: string, status: string) {
    await fetch(`/api/projects/${params.id}/estimate`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: estimateId, status }),
    });
    toast(`Estimate marked ${status.toLowerCase()}`);
    fetchData();
  }

  /** Tear off the stub: an accepted estimate becomes an invoice, lines intact. */
  async function issueInvoice(estimateId: string) {
    setIssuing(estimateId);
    const plan = SPLIT_PLANS.find((p) => p.id === split);
    const res = await fetch("/api/invoices", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        projectId: params.id,
        estimateId,
        depositRate: plan?.deposit ?? 0,
      }),
    });
    setIssuing(null);
    if (res.ok) {
      const invoice = await res.json();
      toast(
        invoice.split
          ? `Deposit ${invoice.number} + balance ${invoice.balance.number} issued`
          : `Invoice ${invoice.number} issued`
      );
      router.push(`/invoices/${invoice.id}`);
    } else {
      toast("Could not issue the invoice", "bad");
    }
  }

  const inputCell =
    "px-2 py-1.5 text-[13px] text-ink";

  return (
    <div className="mx-auto max-w-4xl space-y-6 pb-24 md:pb-0">
      <Link
        href={`/projects/${params.id}`}
        className="eyebrow inline-flex items-center gap-1.5 hover:text-ink"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> Back to job
      </Link>

      <PageHead
        eyebrow={project?.title || "Job"}
        title="Estimates"
        sub={project?.clientName}
        action={
          !creating ? (
            <button onClick={() => setCreating(true)} className={buttonClass("primary")}>
              <Plus className="h-4 w-4" /> New estimate
            </button>
          ) : undefined
        }
      />

      {creating && (
        <div className="plate p-5">
          <div className="eyebrow">Draft estimate</div>

          {/* Price book: a whole job in one click, before anyone types a word. */}
          <div className="mt-4 border border-line bg-sunk p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="eyebrow">Start from a template</span>
              <button
                onClick={() => setShowCalc((v) => !v)}
                className="eyebrow inline-flex items-center gap-1.5 hover:text-ink"
              >
                <Calculator className="h-3.5 w-3.5" /> Moving calculator
              </button>
            </div>
            <div className="mt-2.5 flex flex-wrap gap-1.5">
              {JOB_TEMPLATES.map((t) => (
                <button
                  key={t.id}
                  onClick={() => applyTemplate(t)}
                  title={t.hint}
                  className="border border-line bg-plate px-2.5 py-1.5 text-left transition-colors duration-[140ms] ease-instrument hover:border-ink-3"
                >
                  <span className="block text-[12px] font-bold leading-tight text-ink">
                    {t.label}
                  </span>
                  <span className="eyebrow">{t.trade}</span>
                </button>
              ))}
            </div>

            {showCalc && (
              <div className="mt-3 border-t border-line pt-3">
                <div className="flex flex-wrap items-end gap-3">
                  <div>
                    <label className="eyebrow">Bedrooms</label>
                    <input
                      type="number"
                      min="1"
                      max="8"
                      value={move.bedrooms}
                      onChange={(e) => setMove({ ...move, bedrooms: Number(e.target.value) })}
                      className="mono mt-1.5 w-[80px] px-2 py-1.5 text-[13px]"
                    />
                  </div>
                  <div>
                    <label className="eyebrow">Stair flights</label>
                    <input
                      type="number"
                      min="0"
                      max="12"
                      value={move.flights}
                      onChange={(e) => setMove({ ...move, flights: Number(e.target.value) })}
                      className="mono mt-1.5 w-[80px] px-2 py-1.5 text-[13px]"
                    />
                  </div>
                  <div>
                    <label className="eyebrow">Travel hrs</label>
                    <input
                      type="number"
                      min="0"
                      step="0.5"
                      value={move.travelHours}
                      onChange={(e) => setMove({ ...move, travelHours: Number(e.target.value) })}
                      className="mono mt-1.5 w-[80px] px-2 py-1.5 text-[13px]"
                    />
                  </div>
                  <label className="flex items-center gap-2 pb-2 text-[13px] text-ink-2">
                    <input
                      type="checkbox"
                      checked={move.packing}
                      onChange={(e) => setMove({ ...move, packing: e.target.checked })}
                      className="h-3.5 w-3.5"
                    />
                    Packing
                  </label>
                  <button
                    onClick={() => {
                      setLineItems(quoteMove(move));
                      toast(
                        `Crew of ${crewFor(move.bedrooms).size} · ${baseHoursFor(move.bedrooms)} h quoted`
                      );
                    }}
                    className={`${buttonClass("ghost")} mb-0.5`}
                  >
                    Quote it
                  </button>
                </div>
              </div>
            )}
          </div>

          <div className="mt-4 space-y-2">
            <div className="grid grid-cols-12 gap-2 px-1">
              <div className="eyebrow col-span-5">Description</div>
              <div className="eyebrow col-span-2">Qty</div>
              <div className="eyebrow col-span-2">Unit</div>
              <div className="eyebrow col-span-2">Rate</div>
              <div className="col-span-1" />
            </div>
            {lineItems.map((item, index) => (
              <div key={index} className="grid grid-cols-12 items-center gap-2">
                <input
                  className={`col-span-5 ${inputCell}`}
                  placeholder="Furnace install, labour, disposal…"
                  value={item.description}
                  onChange={(e) => updateLineItem(index, "description", e.target.value)}
                />
                <input
                  className={`col-span-2 mono ${inputCell}`}
                  type="number"
                  min="0"
                  step="0.5"
                  value={item.qty}
                  onChange={(e) => updateLineItem(index, "qty", Number(e.target.value))}
                />
                <input
                  className={`col-span-2 ${inputCell}`}
                  placeholder="hr"
                  value={item.unit}
                  onChange={(e) => updateLineItem(index, "unit", e.target.value)}
                />
                <input
                  className={`col-span-2 mono ${inputCell}`}
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="0.00"
                  value={item.unitPrice || ""}
                  onChange={(e) => updateLineItem(index, "unitPrice", Number(e.target.value))}
                />
                <button
                  onClick={() => removeLineItem(index)}
                  className="col-span-1 flex items-center justify-center text-ink-3 transition-colors hover:text-rose"
                  aria-label="Remove line"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
            <div className="flex flex-wrap items-center gap-4 pt-1">
              <button
                onClick={addLineItem}
                className="eyebrow inline-flex items-center gap-1.5 hover:text-ink"
              >
                <Plus className="h-3.5 w-3.5" /> Blank line
              </button>
              <label className="eyebrow inline-flex items-center gap-2">
                From price book
                <select
                  value=""
                  onChange={(e) => {
                    const item = PRICE_ITEMS.find((p) => p.description === e.target.value);
                    if (item) {
                      // Drop the `trade` tag — it groups the picker, it is not a line field.
                      const line = {
                        description: item.description,
                        qty: item.qty,
                        unit: item.unit,
                        unitPrice: item.unitPrice,
                      };
                      setLineItems((prev) => [...prev.filter((l) => l.description), line]);
                    }
                  }}
                  className="mono px-2 py-1 text-[11px] uppercase tracking-[0.06em]"
                >
                  <option value="">Pick a line…</option>
                  {(["HVAC", "MOVING", "GENERAL"] as const).map((trade) => (
                    <optgroup key={trade} label={trade}>
                      {PRICE_ITEMS.filter((p) => p.trade === trade).map((p) => (
                        <option key={p.description} value={p.description}>
                          {p.description} — {p.unitPrice}/{p.unit}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </label>
            </div>
          </div>

          <div className="mt-5 flex justify-end border-t border-line pt-4">
            <dl className="w-full max-w-[280px] space-y-2 text-[13px]">
              <div className="flex justify-between">
                <dt className="text-ink-2">Subtotal</dt>
                <dd className="mono text-ink">{formatCurrency(subtotal)}</dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="flex items-center gap-2 text-ink-2">
                  Tax
                  <select
                    value={taxRate}
                    onChange={(e) => setTaxRate(Number(e.target.value))}
                    className="mono px-1.5 py-0.5 text-[11px]"
                  >
                    <option value={0}>0%</option>
                    <option value={0.05}>5% GST</option>
                    <option value={0.13}>13% HST (ON)</option>
                    <option value={0.15}>15% HST (Atlantic)</option>
                  </select>
                </dt>
                <dd className="mono text-ink">{formatCurrency(tax)}</dd>
              </div>
              <div className="flex justify-between border-t border-line pt-2">
                <dt className="text-[13px] font-bold uppercase tracking-[0.06em] text-ink">
                  Total
                </dt>
                <dd className="mono text-[19px] font-bold text-ink">{formatCurrency(total)}</dd>
              </div>
            </dl>
          </div>

          <div className="mt-4">
            <label className="eyebrow">Notes</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder="Payment terms, warranty, access notes…"
              className="mt-1.5 w-full px-3 py-2 text-[13px]"
            />
          </div>

          <div className="mt-4 flex gap-2">
            <button
              onClick={handleSave}
              disabled={saving || lineItems.every((i) => !i.description)}
              className={buttonClass("primary")}
            >
              {saving ? "Saving…" : "Save estimate"}
            </button>
            <button onClick={() => setCreating(false)} className={buttonClass("ghost")}>
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="space-y-4">
        {estimates.length === 0 && !creating && <Empty>No estimates on this job yet</Empty>}
        {estimates.map((estimate, i) => {
          const items = JSON.parse(estimate.lineItems) as LineItem[];
          return (
            <div
              key={estimate.id}
              className="plate"
              style={{ borderLeft: `4px solid ${spineFor(estimate.status)}` }}
            >
              <div className="flex items-center justify-between border-b border-line px-5 py-4">
                <div>
                  <span className="mono text-[11px] tracking-[0.08em] text-ink-3">
                    EST-{new Date(estimate.createdAt).getFullYear()}-
                    {String(estimates.length - i).padStart(3, "0")}
                  </span>
                  <p className="mono mt-1 text-[12px] text-ink-2">
                    {new Date(estimate.createdAt).toLocaleDateString("en-CA")}
                  </p>
                </div>
                <div className="flex items-center gap-4">
                  <span className="eyebrow" style={{ color: textToneFor(estimate.status) }}>
                    {estimate.status}
                  </span>
                  <a
                    href={`/api/projects/${params.id}/estimate/pdf?estimateId=${estimate.id}`}
                    target="_blank"
                    className="text-ink-3 transition-colors hover:text-ink"
                    aria-label="Open printable estimate"
                    title="Printable sheet"
                  >
                    <Printer className="h-4 w-4" />
                  </a>
                </div>
              </div>

              <div className="px-5 py-4">
                {items.map((item, j) => (
                  <div
                    key={j}
                    className="flex items-baseline justify-between border-b border-line py-2 last:border-b-0"
                  >
                    <span className="text-[14px] text-ink">
                      {item.description}{" "}
                      <span className="mono text-[12px] text-ink-3">
                        {item.qty} {item.unit}
                      </span>
                    </span>
                    <span className="mono text-[14px] text-ink">
                      {formatCurrency(item.qty * item.unitPrice)}
                    </span>
                  </div>
                ))}

                <div className="mt-3 flex justify-end">
                  <dl className="w-full max-w-[240px] space-y-1.5 text-[13px]">
                    <div className="flex justify-between">
                      <dt className="text-ink-2">Subtotal</dt>
                      <dd className="mono text-ink-2">{formatCurrency(estimate.subtotal)}</dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-ink-2">Tax</dt>
                      <dd className="mono text-ink-2">{formatCurrency(estimate.tax)}</dd>
                    </div>
                    <div className="flex justify-between border-t border-line pt-1.5">
                      <dt className="text-[13px] font-bold uppercase tracking-[0.06em] text-ink">
                        Total
                      </dt>
                      <dd className="mono text-[17px] font-bold text-ink">
                        {formatCurrency(estimate.total)}
                      </dd>
                    </div>
                  </dl>
                </div>

                {estimate.status === "DRAFT" && (
                  <div className="mt-4 flex gap-2">
                    <button
                      onClick={() => handleUpdateStatus(estimate.id, "SENT")}
                      className={buttonClass("primary")}
                    >
                      <Send className="h-3.5 w-3.5" /> Mark sent
                    </button>
                  </div>
                )}
                {estimate.status === "SENT" && (
                  <div className="mt-4 flex gap-2">
                    <button
                      onClick={() => handleUpdateStatus(estimate.id, "ACCEPTED")}
                      className={buttonClass("primary")}
                    >
                      Client accepted
                    </button>
                    <button
                      onClick={() => handleUpdateStatus(estimate.id, "REJECTED")}
                      className={buttonClass("danger")}
                    >
                      Declined
                    </button>
                  </div>
                )}
              </div>

              {/* The tear-off: accepted estimate → invoice, same lines, new number. */}
              {estimate.status === "ACCEPTED" && (
                <>
                  <div className="perf mx-5" />
                  <div className="px-5 py-4">
                    <p className="text-[13px] text-ink-2">
                      Accepted — tear off the stub and bill it.
                    </p>
                    {/* An install is billed as a deposit plus a balance, not one lump. */}
                    <div className="mt-3 flex flex-wrap items-end justify-between gap-4">
                      <div>
                        <label className="eyebrow">Billing</label>
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {SPLIT_PLANS.map((pl) => (
                            <button
                              key={pl.id}
                              type="button"
                              onClick={() => setSplit(pl.id)}
                              title={pl.hint}
                              className="border px-2.5 py-1.5 text-[12px] font-bold transition-colors duration-[140ms] ease-instrument"
                              style={{
                                borderColor:
                                  split === pl.id ? "var(--navy-900)" : "var(--line)",
                                background:
                                  split === pl.id ? "var(--sunk)" : "var(--plate)",
                                color: "var(--ink)",
                              }}
                            >
                              {pl.label}
                            </button>
                          ))}
                        </div>
                        <p className="mt-2 text-[12px] text-ink-2">
                          {SPLIT_PLANS.find((pl) => pl.id === split)?.hint}
                        </p>
                      </div>
                      <button
                        disabled={issuing === estimate.id}
                        onClick={() => issueInvoice(estimate.id)}
                        className={buttonClass("primary")}
                      >
                        <Scissors className="h-3.5 w-3.5" />
                        {issuing === estimate.id ? "Issuing…" : "Issue invoice"}
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
