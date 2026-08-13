"use client";

import { useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { formatDate } from "@/lib/utils";
import { formatCents, inCents, type InCents } from "@/lib/money";
import {
  PageHead,
  LaneHead,
  Plate,
  Empty,
  Money,
  Readout,
  buttonClass,
} from "@/components/ui/primitives";
import { toast } from "@/components/ui/Toaster";

interface ApiPayment {
  id: string;
  amount: number;
  method: string;
  date: string;
  notes?: string;
  project: { id: string; title: string; clientName: string };
}

interface ApiExpense {
  id: string;
  amount: number;
  category: string;
  description?: string;
  date: string;
  project?: { id: string; title: string };
}

/** The books as the API serves them: dollars. */
interface ApiFinanceSummary {
  totalRevenue: number;
  totalExpenses: number;
  netProfit: number;
  projectCount: number;
  payments: ApiPayment[];
  expenses: ApiExpense[];
}

/** What this screen works in. */
type FinanceSummary = InCents<ApiFinanceSummary>;

const MONTHS = [
  "",
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

/* The compact ghost button that lives inside a lane head — same rank language
   as buttonClass("ghost"), scaled to the eyebrow line it sits on. */
const laneBtn =
  "inline-flex items-center gap-1 rounded border border-line bg-plate px-2 py-1 text-[11px] font-bold uppercase tracking-[0.05em] text-ink-2 transition-all duration-[140ms] ease-instrument hover:border-ink-3 hover:text-ink active:translate-y-px";

export default function FinancePage() {
  const [data, setData] = useState<FinanceSummary | null>(null);
  const [year, setYear] = useState(new Date().getFullYear());
  const [month, setMonth] = useState<number | "">(new Date().getMonth() + 1);
  const [showPaymentForm, setShowPaymentForm] = useState(false);
  const [showExpenseForm, setShowExpenseForm] = useState(false);
  const [paymentForm, setPaymentForm] = useState({
    projectId: "",
    amount: "",
    method: "CASH",
    notes: "",
    date: "",
  });
  const [expenseForm, setExpenseForm] = useState({
    projectId: "",
    amount: "",
    category: "MATERIALS",
    description: "",
    date: "",
  });
  const [projects, setProjects] = useState<{ id: string; title: string }[]>([]);

  async function fetchData() {
    const params = new URLSearchParams({ year: String(year) });
    if (month) params.set("month", String(month));
    const [finRes, projRes] = await Promise.all([
      fetch(`/api/finance/summary?${params}`),
      fetch("/api/projects"),
    ]);
    // The one door on this screen: dollars off the wire, cents in the ledger. Both
    // forms below post the other way, in the dollars the owner typed.
    setData(inCents((await finRes.json()) as ApiFinanceSummary));
    setProjects(await projRes.json());
  }

  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year, month]);

  async function handleAddPayment(e: React.FormEvent) {
    e.preventDefault();
    await fetch("/api/finance/payments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(paymentForm),
    });
    setShowPaymentForm(false);
    setPaymentForm({ projectId: "", amount: "", method: "CASH", notes: "", date: "" });
    toast("Payment recorded");
    fetchData();
  }

  async function handleAddExpense(e: React.FormEvent) {
    e.preventDefault();
    await fetch("/api/finance/expenses", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(expenseForm),
    });
    setShowExpenseForm(false);
    setExpenseForm({ projectId: "", amount: "", category: "MATERIALS", description: "", date: "" });
    toast("Cost recorded");
    fetchData();
  }

  const field = "w-full mt-1.5 px-3 py-2 text-[13px]";
  const netCents = data?.netProfitCents || 0;
  const payments = data?.payments || [];
  const expenses = data?.expenses || [];
  const periodLabel = month ? `${MONTHS[month]} ${year}` : `Full year ${year}`;

  return (
    <div className="space-y-8 pb-24 md:pb-0">
      <PageHead
        eyebrow="Books"
        title="Finance"
        sub="What came in, what went out, what is left."
        action={
          <div className="flex gap-2">
            <select
              value={month}
              onChange={(e) => setMonth(e.target.value ? Number(e.target.value) : "")}
              className="mono px-2.5 py-2 text-[12px] uppercase tracking-[0.06em]"
            >
              <option value="">Full year</option>
              {MONTHS.slice(1).map((m, i) => (
                <option key={i + 1} value={i + 1}>
                  {m}
                </option>
              ))}
            </select>
            <select
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
              className="mono px-2.5 py-2 text-[12px]"
            >
              {[2024, 2025, 2026, 2027].map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </div>
        }
      />

      {/* ================================================================
          THE T-ACCOUNT — money in on the left page, money out on the
          right, one center rule between them. The month-end books.
          ================================================================ */}
      <section>
        <div className="grid md:grid-cols-2">
          {/* IN — the left page of the book */}
          <div className="md:pr-8">
            <LaneHead
              title="In — Payments"
              lamp="var(--emerald)"
              right={
                <button
                  onClick={() => setShowPaymentForm(!showPaymentForm)}
                  className={laneBtn}
                >
                  <Plus className="h-3 w-3" /> Payment in
                </button>
              }
            />

            {showPaymentForm && (
              <Plate className="mb-4 p-5">
                <div className="eyebrow">Record payment</div>
                <form onSubmit={handleAddPayment} className="mt-4 grid grid-cols-2 gap-4">
                  <div className="col-span-2">
                    <label className="eyebrow">Job *</label>
                    <select
                      required
                      value={paymentForm.projectId}
                      onChange={(e) =>
                        setPaymentForm({ ...paymentForm, projectId: e.target.value })
                      }
                      className={field}
                    >
                      <option value="">Select job…</option>
                      {projects.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.title}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="eyebrow">Amount *</label>
                    <input
                      required
                      type="number"
                      step="0.01"
                      value={paymentForm.amount}
                      onChange={(e) =>
                        setPaymentForm({ ...paymentForm, amount: e.target.value })
                      }
                      className={`${field} mono`}
                    />
                  </div>
                  <div>
                    <label className="eyebrow">Method</label>
                    <select
                      value={paymentForm.method}
                      onChange={(e) =>
                        setPaymentForm({ ...paymentForm, method: e.target.value })
                      }
                      className={`${field} mono uppercase tracking-[0.06em]`}
                    >
                      {["CASH", "E_TRANSFER", "CHEQUE", "CARD"].map((m) => (
                        <option key={m} value={m}>
                          {m.replace("_", "-")}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="eyebrow">Date</label>
                    <input
                      type="date"
                      value={paymentForm.date}
                      onChange={(e) =>
                        setPaymentForm({ ...paymentForm, date: e.target.value })
                      }
                      className={`${field} mono`}
                    />
                  </div>
                  <div>
                    <label className="eyebrow">Notes</label>
                    <input
                      value={paymentForm.notes}
                      onChange={(e) =>
                        setPaymentForm({ ...paymentForm, notes: e.target.value })
                      }
                      className={field}
                    />
                  </div>
                  <div className="col-span-2 flex gap-2">
                    <button type="submit" className={buttonClass("primary")}>
                      Save
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowPaymentForm(false)}
                      className={buttonClass("ghost")}
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              </Plate>
            )}

            {payments.length === 0 ? (
              <Empty>No money in this period</Empty>
            ) : (
              <div className="border-t border-line pt-1.5">
                {payments.map((p) => (
                  <div key={p.id} className="flex items-baseline gap-2.5 py-2">
                    <span className="mono shrink-0 text-[11px] text-ink-3">
                      {formatDate(p.date)} · {p.method.replace("_", "-")}
                    </span>
                    <span
                      className="min-w-0 truncate text-[13px] font-medium text-ink"
                      title={p.notes || undefined}
                    >
                      {p.project.clientName} · {p.project.title}
                    </span>
                    <span className="dotlead" aria-hidden="true" />
                    <Money
                      cents={p.amountCents}
                      className="shrink-0 text-[13px] text-emerald-ink"
                    />
                  </div>
                ))}
              </div>
            )}

            <div className="rule-double mt-3 flex items-baseline justify-between gap-4 pt-2.5">
              <span className="eyebrow">Total in</span>
              <Readout
                value={formatCents(data?.totalRevenueCents || 0)}
                size={22}
                tone={data?.totalRevenueCents ? "var(--emerald-ink)" : "var(--ink-3)"}
              />
            </div>
          </div>

          {/* OUT — the right page. The center rule is this column's left edge;
              below md it becomes a horizontal rule and OUT stacks under IN. */}
          <div className="mt-10 border-t border-line pt-6 md:mt-0 md:border-t-0 md:border-l md:pt-0 md:pl-8">
            <LaneHead
              title="Out — Expenses"
              lamp="var(--rose)"
              right={
                <button
                  onClick={() => setShowExpenseForm(!showExpenseForm)}
                  className={laneBtn}
                >
                  <Plus className="h-3 w-3" /> Cost out
                </button>
              }
            />

            {showExpenseForm && (
              <Plate className="mb-4 p-5">
                <div className="eyebrow">Record cost</div>
                <form onSubmit={handleAddExpense} className="mt-4 grid grid-cols-2 gap-4">
                  <div className="col-span-2">
                    <label className="eyebrow">Job (optional)</label>
                    <select
                      value={expenseForm.projectId}
                      onChange={(e) =>
                        setExpenseForm({ ...expenseForm, projectId: e.target.value })
                      }
                      className={field}
                    >
                      <option value="">General overhead</option>
                      {projects.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.title}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="eyebrow">Amount *</label>
                    <input
                      required
                      type="number"
                      step="0.01"
                      value={expenseForm.amount}
                      onChange={(e) =>
                        setExpenseForm({ ...expenseForm, amount: e.target.value })
                      }
                      className={`${field} mono`}
                    />
                  </div>
                  <div>
                    <label className="eyebrow">Category</label>
                    <select
                      value={expenseForm.category}
                      onChange={(e) =>
                        setExpenseForm({ ...expenseForm, category: e.target.value })
                      }
                      className={`${field} mono uppercase tracking-[0.06em]`}
                    >
                      {["MATERIALS", "LABOR", "TOOLS", "VEHICLE", "OTHER"].map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="eyebrow">Date</label>
                    <input
                      type="date"
                      value={expenseForm.date}
                      onChange={(e) =>
                        setExpenseForm({ ...expenseForm, date: e.target.value })
                      }
                      className={`${field} mono`}
                    />
                  </div>
                  <div>
                    <label className="eyebrow">Description</label>
                    <input
                      value={expenseForm.description}
                      onChange={(e) =>
                        setExpenseForm({ ...expenseForm, description: e.target.value })
                      }
                      className={field}
                    />
                  </div>
                  <div className="col-span-2 flex gap-2">
                    <button type="submit" className={buttonClass("primary")}>
                      Save
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowExpenseForm(false)}
                      className={buttonClass("ghost")}
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              </Plate>
            )}

            {expenses.length === 0 ? (
              <Empty>No costs this period</Empty>
            ) : (
              <div className="border-t border-line pt-1.5">
                {expenses.map((e) => (
                  <div key={e.id} className="flex items-baseline gap-2.5 py-2">
                    <span className="mono shrink-0 text-[11px] text-ink-3">
                      {formatDate(e.date)} · {e.category}
                    </span>
                    <span className="min-w-0 truncate text-[13px] font-medium text-ink">
                      {e.description || e.category}
                      {e.project ? ` · ${e.project.title}` : ""}
                    </span>
                    <span className="dotlead" aria-hidden="true" />
                    <Money
                      cents={e.amountCents}
                      className="shrink-0 text-[13px] text-rose-ink"
                    />
                  </div>
                ))}
              </div>
            )}

            <div className="rule-double mt-3 flex items-baseline justify-between gap-4 pt-2.5">
              <span className="eyebrow">Total out</span>
              <Readout
                value={formatCents(data?.totalExpensesCents || 0)}
                size={22}
                tone={data?.totalExpensesCents ? "var(--rose-ink)" : "var(--ink-3)"}
              />
            </div>
          </div>
        </div>

        {/* THE BOTTOM LINE — the one dominant number on the page. */}
        <div className="rule-double mt-10 flex flex-wrap items-end justify-between gap-4 pt-4">
          <div>
            <div className="eyebrow">Net · {periodLabel}</div>
            <div className="mono mt-2 text-[11px] uppercase tracking-[0.08em] text-ink-3">
              Jobs closed {data?.projectCount || 0}
            </div>
          </div>
          <Readout
            value={formatCents(netCents)}
            size={30}
            tone={
              netCents > 0
                ? "var(--emerald-ink)"
                : netCents < 0
                  ? "var(--rose-ink)"
                  : "var(--ink-2)"
            }
          />
        </div>

        {/* Straight to the bookkeeper — the period above is what gets exported. */}
        <div className="mono flex flex-wrap items-baseline gap-x-4 gap-y-1 pt-3 text-[11px] uppercase tracking-[0.08em] text-ink-3">
          <span>Export CSV</span>
          {(["invoices", "payments", "expenses", "jobs"] as const).map((kind) => (
            <a
              key={kind}
              href={`/api/export/${kind}?year=${year}${month ? `&month=${month}` : ""}`}
              className="underline underline-offset-4 transition-colors duration-[140ms] ease-instrument hover:text-ink"
            >
              {kind}
            </a>
          ))}
        </div>
      </section>
    </div>
  );
}
