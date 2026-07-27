"use client";

import { useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { formatCurrency, formatDate, cn } from "@/lib/utils";
import { PageHead, Plate, Empty, buttonClass } from "@/components/ui/primitives";
import { toast } from "@/components/ui/Toaster";

interface Payment {
  id: string;
  amount: number;
  method: string;
  date: string;
  notes?: string;
  project: { id: string; title: string; clientName: string };
}

interface Expense {
  id: string;
  amount: number;
  category: string;
  description?: string;
  date: string;
  project?: { id: string; title: string };
}

interface FinanceSummary {
  totalRevenue: number;
  totalExpenses: number;
  netProfit: number;
  projectCount: number;
  payments: Payment[];
  expenses: Expense[];
}

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

export default function FinancePage() {
  const [data, setData] = useState<FinanceSummary | null>(null);
  const [year, setYear] = useState(new Date().getFullYear());
  const [month, setMonth] = useState<number | "">(new Date().getMonth() + 1);
  const [tab, setTab] = useState<"payments" | "expenses">("payments");
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
    setData(await finRes.json());
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
  const net = data?.netProfit || 0;

  return (
    <div className="space-y-6 pb-24 md:pb-0">
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

      {/* The P&L readout — a ruled row of tabular figures, not four cards. */}
      <div className="grid grid-cols-2 border border-line bg-plate md:grid-cols-4">
        {[
          { label: "Revenue", value: formatCurrency(data?.totalRevenue || 0), tone: "var(--emerald)" },
          { label: "Expenses", value: formatCurrency(data?.totalExpenses || 0), tone: "var(--rose)" },
          {
            label: "Net",
            value: formatCurrency(net),
            tone: net >= 0 ? "var(--ink)" : "var(--rose)",
          },
          { label: "Jobs closed", value: String(data?.projectCount || 0) },
        ].map((r) => (
          <div key={r.label} className="border-b border-r border-line px-4 py-4 last:border-r-0">
            <div className="eyebrow">{r.label}</div>
            <p
              className="mono mt-3 text-[24px] font-bold leading-none"
              style={{ color: r.tone || "var(--ink)" }}
            >
              {r.value}
            </p>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        <button onClick={() => setShowPaymentForm(!showPaymentForm)} className={buttonClass("primary")}>
          <Plus className="h-4 w-4" /> Payment in
        </button>
        <button onClick={() => setShowExpenseForm(!showExpenseForm)} className={buttonClass("ghost")}>
          <Plus className="h-4 w-4" /> Cost out
        </button>
      </div>

      {showPaymentForm && (
        <Plate className="p-5">
          <div className="eyebrow">Record payment</div>
          <form onSubmit={handleAddPayment} className="mt-4 grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="eyebrow">Job *</label>
              <select
                required
                value={paymentForm.projectId}
                onChange={(e) => setPaymentForm({ ...paymentForm, projectId: e.target.value })}
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
                onChange={(e) => setPaymentForm({ ...paymentForm, amount: e.target.value })}
                className={`${field} mono`}
              />
            </div>
            <div>
              <label className="eyebrow">Method</label>
              <select
                value={paymentForm.method}
                onChange={(e) => setPaymentForm({ ...paymentForm, method: e.target.value })}
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
                onChange={(e) => setPaymentForm({ ...paymentForm, date: e.target.value })}
                className={`${field} mono`}
              />
            </div>
            <div>
              <label className="eyebrow">Notes</label>
              <input
                value={paymentForm.notes}
                onChange={(e) => setPaymentForm({ ...paymentForm, notes: e.target.value })}
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

      {showExpenseForm && (
        <Plate className="p-5">
          <div className="eyebrow">Record cost</div>
          <form onSubmit={handleAddExpense} className="mt-4 grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="eyebrow">Job (optional)</label>
              <select
                value={expenseForm.projectId}
                onChange={(e) => setExpenseForm({ ...expenseForm, projectId: e.target.value })}
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
                onChange={(e) => setExpenseForm({ ...expenseForm, amount: e.target.value })}
                className={`${field} mono`}
              />
            </div>
            <div>
              <label className="eyebrow">Category</label>
              <select
                value={expenseForm.category}
                onChange={(e) => setExpenseForm({ ...expenseForm, category: e.target.value })}
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
                onChange={(e) => setExpenseForm({ ...expenseForm, date: e.target.value })}
                className={`${field} mono`}
              />
            </div>
            <div>
              <label className="eyebrow">Description</label>
              <input
                value={expenseForm.description}
                onChange={(e) => setExpenseForm({ ...expenseForm, description: e.target.value })}
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

      <div className="flex gap-6 border-b border-line">
        {(["payments", "expenses"] as const).map((t) => (
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
              {t === "payments" ? data?.payments.length || 0 : data?.expenses.length || 0}
            </span>
          </button>
        ))}
      </div>

      {/* Ledger rows — ruled, right-aligned money, no card per line. */}
      {tab === "payments" &&
        ((data?.payments || []).length === 0 ? (
          <Empty>No payments in this period</Empty>
        ) : (
          <Plate>
            {data?.payments.map((p) => (
              <div
                key={p.id}
                className="flex items-center justify-between gap-4 border-b border-line px-4 py-3 last:border-b-0"
              >
                <div className="min-w-0">
                  <p className="truncate text-[14px] font-medium text-ink">
                    {p.project.clientName} · {p.project.title}
                  </p>
                  <p className="mono text-[11px] text-ink-3">
                    {formatDate(p.date)} · {p.method.replace("_", "-")}
                    {p.notes ? ` · ${p.notes}` : ""}
                  </p>
                </div>
                <span
                  className="mono shrink-0 text-[15px] font-medium"
                  style={{ color: "var(--emerald)" }}
                >
                  {formatCurrency(p.amount)}
                </span>
              </div>
            ))}
          </Plate>
        ))}

      {tab === "expenses" &&
        ((data?.expenses || []).length === 0 ? (
          <Empty>No costs in this period</Empty>
        ) : (
          <Plate>
            {data?.expenses.map((e) => (
              <div
                key={e.id}
                className="flex items-center justify-between gap-4 border-b border-line px-4 py-3 last:border-b-0"
              >
                <div className="min-w-0">
                  <p className="truncate text-[14px] font-medium text-ink">
                    {e.description || e.category}
                    {e.project ? ` · ${e.project.title}` : ""}
                  </p>
                  <p className="mono text-[11px] text-ink-3">
                    {formatDate(e.date)} · {e.category}
                  </p>
                </div>
                <span
                  className="mono shrink-0 text-[15px] font-medium"
                  style={{ color: "var(--rose)" }}
                >
                  {formatCurrency(e.amount)}
                </span>
              </div>
            ))}
          </Plate>
        ))}
    </div>
  );
}
