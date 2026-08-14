"use client";

/**
 * THE ESTIMATE — priced standing in somebody's kitchen, on a phone, while the client
 * watches. Two things follow from that and drive this screen:
 *
 *   1. The price book has to be reachable in one tap and has to be SHORT. It used to
 *      be thirteen framed boxes inside a framed recessed panel inside the plate —
 *      three nested rectangles, and 700px of scrolling on a phone before the first
 *      line of the estimate. The templates are recessed chips now, one line each.
 *   2. The running total has to stay in sight while lines are typed, because that is
 *      the number being discussed out loud. It rides in the builder's head, which
 *      sticks to the top of the screen.
 */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, Printer, Send, Scissors, Calculator } from "lucide-react";
import {
  formatCents,
  inCents,
  lineItemsFromInput,
  lineTotalCents,
  parseLineItems,
  quoteTotals,
  type InCents,
} from "@/lib/money";
import {
  BackLink,
  Button,
  buttonClass,
  controlClass,
  Empty,
  Field,
  LaneHead,
  Money,
  Readout,
  spineFor,
  Stamp,
  textToneFor,
  WoNumber,
} from "@/components/ui/primitives";
import { toast } from "@/components/ui/Toaster";
import {
  JOB_TEMPLATES,
  PRICE_ITEMS,
  TRADES,
  quoteMove,
  crewFor,
  baseHoursFor,
  type JobTemplate,
  type MoveInputs,
  type Trade,
} from "@/lib/price-book";
import {
  RENO_FLOORING,
  RENO_SCOPES,
  quoteRenovation,
  renoGeometry,
  type RenoFlooring,
  type RenoInputs,
  type RenoScope,
} from "@/lib/renovation";
import { SPLIT_PLANS } from "@/lib/margin";

/** A line while it is being typed. The form is an edge, so it holds dollars. */
interface LineItem {
  description: string;
  qty: number;
  unit: string;
  unitPrice: number;
}

/** A saved estimate as the API serves it: dollars. */
interface ApiEstimate {
  id: string;
  status: string;
  lineItems: string;
  subtotal: number;
  tax: number;
  total: number;
  notes?: string;
  createdAt: string;
}

type Estimate = InCents<ApiEstimate>;

interface Project {
  id: string;
  title: string;
  clientName: string;
  email?: string;
}

export default function EstimatePage({ params }: { params: { id: string } }) {
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
  /** Which vertical's shelf of the price book is open. */
  const [trade, setTrade] = useState<Trade | "ALL">("ALL");
  const [calc, setCalc] = useState<"MOVE" | "RENO" | null>(null);
  const [move, setMove] = useState<MoveInputs>({
    bedrooms: 2,
    flights: 0,
    travelHours: 1,
    packing: true,
  });
  const [reno, setReno] = useState<RenoInputs>({
    areaSqFt: 700,
    ceilingFt: 8,
    rooms: 3,
    scope: "REFRESH",
    flooring: "VINYL",
  });

  /** A whole job in one click — the price book, not forty keystrokes. */
  function applyTemplate(t: JobTemplate) {
    setLineItems(t.lineItems.map((l) => ({ ...l })));
    setCalc(null);
    toast(`${t.label} — ${t.lineItems.length} lines added`);
  }

  /** A calculator belongs to its vertical; changing shelves closes the wrong one. */
  function pickTrade(next: Trade | "ALL") {
    setTrade(next);
    if (calc === "MOVE" && next !== "ALL" && next !== "MOVING") setCalc(null);
    if (calc === "RENO" && next !== "ALL" && next !== "RENOVATION") setCalc(null);
  }

  const templates = JOB_TEMPLATES.filter((t) => trade === "ALL" || t.trade === trade);
  const showMoveCalc = trade === "ALL" || trade === "MOVING";
  const showRenoCalc = trade === "ALL" || trade === "RENOVATION";

  async function fetchData() {
    const [projRes, estRes] = await Promise.all([
      fetch(`/api/projects/${params.id}`),
      fetch(`/api/projects/${params.id}/estimate`),
    ]);
    setProject(await projRes.json());
    // The one door on this screen: saved estimates arrive in dollars and are held in
    // cents. The builder above works the other way — it is a form, so it holds dollars
    // until they are priced.
    setEstimates(inCents((await estRes.json()) as ApiEstimate[]));
  }

  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Priced by the same function the API prices the saved estimate with, so the number
  // on this screen is the number the client is billed — down to the cent.
  const { subtotalCents, taxCents, totalCents } = quoteTotals(
    lineItemsFromInput(lineItems),
    taxRate
  );

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
      toast("No invoice was issued — this estimate has no priced lines on it", "bad");
    }
  }

  const lineCount = lineItems.filter((l) => l.description).length;

  return (
    <div className="page-doc space-y-6 pb-24 md:pb-0">
      <BackLink href={`/projects/${params.id}`} label="Back to job" />

      {/* A record title, 22px, the same as the lead, the client, the job and the
          invoice this page sits between. It used to carry a 44px PAGE title, so
          walking the owner's road the heading went 22 → 22 → 44 → 22 and the
          estimate read as a different product for one screen. */}
      <div className="plate px-5 py-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <span className="eyebrow">Estimates</span>
            <h1 className="t-record mt-1.5 font-black tracking-tight text-ink">
              {project?.title || "Job"}
            </h1>
            {project?.clientName && (
              <p className="t-lede mt-2 text-ink-2">{project.clientName}</p>
            )}
          </div>
          {!creating && (
            <Button onClick={() => setCreating(true)}>
              <Plus className="h-4 w-4" aria-hidden /> New estimate
            </Button>
          )}
        </div>
      </div>

      {creating && (
        <div className="plate">
          {/* The head rides with the screen: the total under discussion stays on
              view while the lines are typed under it. */}
          <div className="sticky top-0 z-10 flex flex-wrap items-end justify-between gap-4 border-b border-line bg-plate px-5 py-4">
            <div>
              <div className="eyebrow">Draft estimate</div>
              <p className="t-body mt-1.5 text-ink-2">
                {lineCount === 0
                  ? "Pick a template or type the first line"
                  : `${lineCount} ${lineCount === 1 ? "line" : "lines"} · tax ${Math.round(taxRate * 100)}%`}
              </p>
            </div>
            <div className="w-full text-right sm:w-auto">
              <div className="eyebrow">Total</div>
              <div className="mt-1">
                <Readout value={formatCents(totalCents)} />
              </div>
            </div>
          </div>

          <div className="px-5 py-5">
            {/* THE PRICE BOOK — a shelf, not a wall of boxes. */}
            <section>
              <LaneHead
                title="Start from a template"
                right={
                  <div className="flex flex-wrap gap-2">
                    {showMoveCalc && (
                      <button
                        type="button"
                        aria-pressed={calc === "MOVE"}
                        onClick={() => setCalc((v) => (v === "MOVE" ? null : "MOVE"))}
                        className={buttonClass("quiet")}
                        style={
                          calc === "MOVE"
                            ? { borderColor: "var(--navy-900)", color: "var(--ink)" }
                            : undefined
                        }
                      >
                        <Calculator className="hidden h-3.5 w-3.5 sm:block" aria-hidden /> Moving calculator
                      </button>
                    )}
                    {showRenoCalc && (
                      <button
                        type="button"
                        aria-pressed={calc === "RENO"}
                        onClick={() => setCalc((v) => (v === "RENO" ? null : "RENO"))}
                        className={buttonClass("quiet")}
                        style={
                          calc === "RENO"
                            ? { borderColor: "var(--navy-900)", color: "var(--ink)" }
                            : undefined
                        }
                      >
                        <Calculator className="hidden h-3.5 w-3.5 sm:block" aria-hidden /> Renovation take-off
                      </button>
                    )}
                  </div>
                }
              />

              {/* The shelf switch: one book, four verticals. */}
              <div
                className="flex flex-wrap items-center gap-x-4 border-b border-line"
                role="tablist"
                aria-label="Trade"
              >
                {(["ALL", ...TRADES] as const).map((t) => (
                  <button
                    key={t}
                    role="tab"
                    aria-selected={trade === t}
                    onClick={() => pickTrade(t)}
                    className="eyebrow pb-2 transition-colors duration-fast ease-instrument hover:text-ink"
                    style={{
                      color: trade === t ? "var(--ink)" : undefined,
                      borderBottom:
                        trade === t ? "2px solid var(--navy-900)" : "2px solid transparent",
                      marginBottom: "-1px",
                    }}
                  >
                    {t}
                  </button>
                ))}
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                {templates.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => applyTemplate(t)}
                    title={t.hint}
                    className="chip transition-colors duration-fast ease-instrument hover:bg-line"
                  >
                    {/* The label is written on the child, where a direct declaration
                        beats what `.chip` hands down: mono uppercase at 13px runs one
                        template per line on a phone, and the shelf is a wall again. */}
                    <span className="t-meta font-sans font-bold normal-case tracking-normal text-ink">
                      {t.label}
                    </span>
                    <span className="eyebrow hidden sm:inline">{t.trade}</span>
                  </button>
                ))}
              </div>

              {calc === "MOVE" && (
                <div className="mt-4 border-t border-line pt-4">
                  <div className="flex flex-wrap items-end gap-3">
                    <Field id="move-bedrooms" label="Bedrooms" className="w-[92px]">
                      {(f) => (
                        <input
                          {...f}
                          type="number"
                          min="1"
                          max="8"
                          value={move.bedrooms}
                          onChange={(e) => setMove({ ...move, bedrooms: Number(e.target.value) })}
                          className={`${f.className} mono`}
                        />
                      )}
                    </Field>
                    <Field id="move-flights" label="Stair flights" className="w-[110px]">
                      {(f) => (
                        <input
                          {...f}
                          type="number"
                          min="0"
                          max="12"
                          value={move.flights}
                          onChange={(e) => setMove({ ...move, flights: Number(e.target.value) })}
                          className={`${f.className} mono`}
                        />
                      )}
                    </Field>
                    <Field id="move-travel" label="Travel hrs" className="w-[100px]">
                      {(f) => (
                        <input
                          {...f}
                          type="number"
                          min="0"
                          step="0.5"
                          value={move.travelHours}
                          onChange={(e) =>
                            setMove({ ...move, travelHours: Number(e.target.value) })
                          }
                          className={`${f.className} mono`}
                        />
                      )}
                    </Field>
                    <label className="t-body flex h-[38px] items-center gap-2 text-ink-2">
                      <input
                        type="checkbox"
                        checked={move.packing}
                        onChange={(e) => setMove({ ...move, packing: e.target.checked })}
                        className="h-4 w-4"
                      />
                      Packing
                    </label>
                    <div className="actions">
                      <Button
                        variant="ghost"
                        onClick={() => {
                          setLineItems(quoteMove(move));
                          toast(
                            `Crew of ${crewFor(move.bedrooms).size} · ${baseHoursFor(move.bedrooms)} h quoted`
                          );
                        }}
                      >
                        Quote it
                      </Button>
                    </div>
                  </div>
                </div>
              )}

              {calc === "RENO" && (
                <div className="mt-4 border-t border-line pt-4">
                  <div className="flex flex-wrap items-end gap-3">
                    <Field id="reno-area" label="Area sq ft" className="w-[104px]">
                      {(f) => (
                        <input
                          {...f}
                          type="number"
                          min="40"
                          step="10"
                          value={reno.areaSqFt}
                          onChange={(e) => setReno({ ...reno, areaSqFt: Number(e.target.value) })}
                          className={`${f.className} mono`}
                        />
                      )}
                    </Field>
                    <Field id="reno-ceiling" label="Ceiling ft" className="w-[100px]">
                      {(f) => (
                        <input
                          {...f}
                          type="number"
                          min="7"
                          max="16"
                          step="0.5"
                          value={reno.ceilingFt}
                          onChange={(e) => setReno({ ...reno, ceilingFt: Number(e.target.value) })}
                          className={`${f.className} mono`}
                        />
                      )}
                    </Field>
                    <Field id="reno-rooms" label="Rooms" className="w-[92px]">
                      {(f) => (
                        <input
                          {...f}
                          type="number"
                          min="1"
                          max="20"
                          value={reno.rooms}
                          onChange={(e) => setReno({ ...reno, rooms: Number(e.target.value) })}
                          className={`${f.className} mono`}
                        />
                      )}
                    </Field>
                    <Field id="reno-scope" label="Work" className="w-[168px]">
                      {(f) => (
                        <select
                          {...f}
                          value={reno.scope}
                          onChange={(e) =>
                            setReno({ ...reno, scope: e.target.value as RenoScope })
                          }
                          className={`${f.className} mono`}
                        >
                          {RENO_SCOPES.map((s) => (
                            <option key={s.id} value={s.id} title={s.hint}>
                              {s.label}
                            </option>
                          ))}
                        </select>
                      )}
                    </Field>
                    <Field id="reno-floor" label="Floor" className="w-[150px]">
                      {(f) => (
                        <select
                          {...f}
                          value={reno.flooring}
                          disabled={reno.scope === "PAINT"}
                          onChange={(e) =>
                            setReno({ ...reno, flooring: e.target.value as RenoFlooring })
                          }
                          className={`${f.className} mono disabled:text-ink-3`}
                        >
                          {RENO_FLOORING.map((fl) => (
                            <option key={fl.id} value={fl.id}>
                              {fl.label}
                            </option>
                          ))}
                        </select>
                      )}
                    </Field>
                    <div className="actions">
                      <Button
                        variant="ghost"
                        onClick={() => {
                          const g = renoGeometry(reno);
                          setLineItems(quoteRenovation(reno));
                          toast(
                            `${g.wallSqFt} sq ft of wall · ${g.trimLf} lf trim · ${g.doors} doors`
                          );
                        }}
                      >
                        Take it off
                      </Button>
                    </div>
                  </div>
                  <p className="measure t-body mt-3 text-ink-2">
                    Quantities are inferred from the floor area — walk the site and correct
                    them before this goes to the client.
                  </p>
                </div>
              )}
            </section>

            {/* THE LINES */}
            <section className="mt-10">
              <LaneHead title="Lines" />
              <div className="hidden grid-cols-12 gap-2 px-1 pb-1.5 sm:grid">
                <div className="eyebrow col-span-5">Description</div>
                <div className="eyebrow col-span-2">Qty</div>
                <div className="eyebrow col-span-2">Unit</div>
                <div className="eyebrow col-span-2">Rate</div>
                <div className="col-span-1" />
              </div>
              <div className="space-y-2 border-t border-line pt-3 sm:pt-2">
                {lineItems.map((item, index) => (
                  <div key={index} className="grid grid-cols-12 items-center gap-2">
                    <input
                      className={controlClass("col-span-12 sm:col-span-5")}
                      placeholder="Furnace install, labour, disposal…"
                      aria-label={`Line ${index + 1} description`}
                      value={item.description}
                      onChange={(e) => updateLineItem(index, "description", e.target.value)}
                    />
                    <input
                      className={controlClass("mono col-span-3 sm:col-span-2")}
                      type="number"
                      min="0"
                      step="0.5"
                      aria-label={`Line ${index + 1} quantity`}
                      value={item.qty}
                      onChange={(e) => updateLineItem(index, "qty", Number(e.target.value))}
                    />
                    <input
                      className={controlClass("col-span-3 sm:col-span-2")}
                      placeholder="hr"
                      aria-label={`Line ${index + 1} unit`}
                      value={item.unit}
                      onChange={(e) => updateLineItem(index, "unit", e.target.value)}
                    />
                    <input
                      className={controlClass("mono col-span-4 text-right sm:col-span-2")}
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder="0.00"
                      aria-label={`Line ${index + 1} rate`}
                      value={item.unitPrice || ""}
                      onChange={(e) => updateLineItem(index, "unitPrice", Number(e.target.value))}
                    />
                    <button
                      onClick={() => removeLineItem(index)}
                      className="col-span-2 flex items-center justify-center text-ink-3 transition-colors duration-fast ease-instrument hover:text-rose sm:col-span-1"
                      aria-label={`Remove line ${index + 1}`}
                    >
                      <Trash2 className="h-4 w-4" aria-hidden />
                    </button>
                  </div>
                ))}
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-4">
                <button
                  onClick={addLineItem}
                  className="eyebrow inline-flex items-center gap-1.5 hover:text-ink"
                >
                  <Plus className="h-3.5 w-3.5" aria-hidden /> Blank line
                </button>
                <div className="flex items-center gap-2">
                  <label htmlFor="price-book" className="eyebrow">
                    From price book
                  </label>
                  <select
                    id="price-book"
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
                    className={controlClass("mono w-auto max-w-[220px]")}
                  >
                    <option value="">Pick a line…</option>
                    {TRADES.map((t) => (
                      <optgroup key={t} label={t}>
                        {PRICE_ITEMS.filter((p) => p.trade === t).map((p) => (
                          <option key={p.description} value={p.description}>
                            {p.description} — {p.unitPrice}/{p.unit}
                          </option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                </div>
              </div>
            </section>

            {/* WHAT IT COMES TO */}
            <div className="mt-10 flex justify-end border-t border-line pt-4">
              <dl className="t-body w-full max-w-[300px] space-y-2">
                <div className="flex justify-between gap-6">
                  <dt className="text-ink-2">Subtotal</dt>
                  <dd>
                    <Money cents={subtotalCents} />
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-6">
                  <dt className="flex items-center gap-2 text-ink-2">
                    <label htmlFor="tax-rate">Tax</label>
                    <select
                      id="tax-rate"
                      value={taxRate}
                      onChange={(e) => setTaxRate(Number(e.target.value))}
                      className={controlClass("mono w-auto")}
                    >
                      <option value={0}>0%</option>
                      <option value={0.05}>5% GST</option>
                      <option value={0.13}>13% HST (ON)</option>
                      <option value={0.15}>15% HST (Atlantic)</option>
                    </select>
                  </dt>
                  <dd>
                    <Money cents={taxCents} />
                  </dd>
                </div>
                <div className="rule-double flex items-baseline justify-between gap-6 pt-2">
                  <dt className="eyebrow text-ink">Total</dt>
                  <dd>
                    <Money cents={totalCents} className="t-row font-bold" />
                  </dd>
                </div>
              </dl>
            </div>

            <Field
              id="estimate-notes"
              label="Notes"
              hint="Printed on the sheet the client reads."
              className="mt-6"
            >
              {(f) => (
                <textarea
                  {...f}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={2}
                  placeholder="Payment terms, warranty, access notes…"
                />
              )}
            </Field>

            <div className="actions mt-6">
              <Button
                onClick={handleSave}
                disabled={saving || lineItems.every((i) => !i.description)}
              >
                {saving ? "Saving…" : "Save estimate"}
              </Button>
              <Button variant="ghost" onClick={() => setCreating(false)}>
                Cancel
              </Button>
            </div>
          </div>
        </div>
      )}

      <div className="space-y-6">
        {estimates.length === 0 && !creating && (
          <Empty hint="Pick a template from the price book and the lines fill themselves in — then price it while you are still standing in the room.">
            No estimates on this job yet
          </Empty>
        )}
        {estimates.map((estimate) => {
          const items = parseLineItems(estimate.lineItems);
          return (
            <div
              key={estimate.id}
              className="plate"
              style={{ borderLeft: `4px solid ${spineFor(estimate.status)}` }}
            >
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4">
                <div>
                  {/* The same reference the printed sheet and the journal carry. */}
                  <WoNumber id={estimate.id} prefix="EST" date={estimate.createdAt} />
                  <p className="t-meta mt-1.5 text-ink-2">
                    <Stamp date={estimate.createdAt} />
                  </p>
                </div>
                <div className="flex items-center gap-4">
                  <span className="eyebrow" style={{ color: textToneFor(estimate.status) }}>
                    {estimate.status}
                  </span>
                  <a
                    href={`/api/projects/${params.id}/estimate/pdf?estimateId=${estimate.id}`}
                    target="_blank"
                    rel="noopener"
                    className="text-ink-3 transition-colors duration-fast ease-instrument hover:text-ink"
                    aria-label="Print sheet"
                    title="Print sheet"
                  >
                    <Printer className="h-4 w-4" aria-hidden />
                  </a>
                </div>
              </div>

              <div className="px-5 py-4">
                {/* Desk: description · qty · amount in three columns. Phone: the
                    same shape the invoice card and the printed sheet take — the
                    description keeps the line, the quantity and the money share
                    the next one. Three columns at 390px cut every description
                    into three ragged lines. */}
                {items.map((item, j) => (
                  <div key={j} className="border-b border-line py-2 last:border-b-0">
                    <div className="sm:flex sm:items-baseline sm:gap-3">
                      <span className="t-body min-w-0 flex-1 text-ink">{item.description}</span>
                      <span className="mono t-meta hidden w-[92px] shrink-0 text-right text-ink-3 sm:inline">
                        {item.qty} {item.unit}
                      </span>
                      <Money
                        cents={lineTotalCents(item)}
                        className="t-body hidden w-[100px] shrink-0 text-right sm:block"
                      />
                    </div>
                    <div className="mt-1 flex items-baseline justify-between gap-3 sm:hidden">
                      <span className="mono t-meta text-ink-3">
                        {item.qty} {item.unit}
                      </span>
                      <Money cents={lineTotalCents(item)} className="t-body font-bold" />
                    </div>
                  </div>
                ))}

                <div className="mt-4 flex justify-end">
                  <dl className="t-body w-full max-w-[260px] space-y-1.5">
                    <div className="flex justify-between gap-6">
                      <dt className="text-ink-2">Subtotal</dt>
                      <dd>
                        <Money cents={estimate.subtotalCents} tone="var(--ink-2)" />
                      </dd>
                    </div>
                    <div className="flex justify-between gap-6">
                      <dt className="text-ink-2">Tax</dt>
                      <dd>
                        <Money cents={estimate.taxCents} tone="var(--ink-2)" />
                      </dd>
                    </div>
                    <div className="rule-double flex items-baseline justify-between gap-6 pt-1.5">
                      <dt className="eyebrow text-ink">Total</dt>
                      <dd>
                        <Money cents={estimate.totalCents} className="t-row font-bold" />
                      </dd>
                    </div>
                  </dl>
                </div>

                {estimate.status === "DRAFT" && (
                  <div className="actions mt-4">
                    <Button onClick={() => handleUpdateStatus(estimate.id, "SENT")}>
                      <Send className="h-3.5 w-3.5" aria-hidden /> Mark sent
                    </Button>
                  </div>
                )}
                {estimate.status === "SENT" && (
                  <div className="actions mt-4">
                    <Button onClick={() => handleUpdateStatus(estimate.id, "ACCEPTED")}>
                      Client accepted
                    </Button>
                    <Button
                      variant="danger"
                      onClick={() => handleUpdateStatus(estimate.id, "REJECTED")}
                    >
                      Declined
                    </Button>
                  </div>
                )}
              </div>

              {/* The tear-off: accepted estimate → invoice, same lines, new number. */}
              {estimate.status === "ACCEPTED" && (
                <>
                  <div className="perf mx-5" />
                  <div className="px-5 py-4">
                    <p className="t-body text-ink-2">Accepted — tear off the stub and bill it.</p>
                    {/* An install is billed as a deposit plus a balance, not one lump. */}
                    <div className="mt-4 flex flex-wrap items-end justify-between gap-4">
                      <div>
                        <div className="eyebrow" id={`billing-${estimate.id}`}>
                          Billing
                        </div>
                        <div
                          className="mt-2 flex flex-wrap gap-2"
                          role="radiogroup"
                          aria-labelledby={`billing-${estimate.id}`}
                        >
                          {SPLIT_PLANS.map((pl) => (
                            <button
                              key={pl.id}
                              type="button"
                              role="radio"
                              aria-checked={split === pl.id}
                              onClick={() => setSplit(pl.id)}
                              title={pl.hint}
                              className={buttonClass("ghost")}
                              style={
                                split === pl.id
                                  ? {
                                      borderColor: "var(--navy-900)",
                                      background: "var(--sunk)",
                                      color: "var(--ink)",
                                    }
                                  : undefined
                              }
                            >
                              {pl.label}
                            </button>
                          ))}
                        </div>
                        <p className="measure t-meta mt-2 text-ink-2">
                          {SPLIT_PLANS.find((pl) => pl.id === split)?.hint}
                        </p>
                      </div>
                      <div className="actions">
                        <Button
                          disabled={issuing === estimate.id}
                          onClick={() => issueInvoice(estimate.id)}
                        >
                          <Scissors className="h-3.5 w-3.5" aria-hidden />
                          {issuing === estimate.id ? "Issuing…" : "Issue invoice"}
                        </Button>
                      </div>
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
