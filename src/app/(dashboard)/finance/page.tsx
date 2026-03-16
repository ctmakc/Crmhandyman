"use client";

import { useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { formatCurrency, formatDate } from "@/lib/utils";

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

export default function FinancePage() {
  const [data, setData] = useState<FinanceSummary | null>(null);
  const [year, setYear] = useState(new Date().getFullYear());
  const [month, setMonth] = useState<number | "">(new Date().getMonth() + 1);
  const [tab, setTab] = useState<"payments" | "expenses">("payments");
  const [showPaymentForm, setShowPaymentForm] = useState(false);
  const [showExpenseForm, setShowExpenseForm] = useState(false);
  const [paymentForm, setPaymentForm] = useState({ projectId: "", amount: "", method: "CASH", notes: "", date: "" });
  const [expenseForm, setExpenseForm] = useState({ projectId: "", amount: "", category: "MATERIALS", description: "", date: "" });
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

  useEffect(() => { fetchData(); }, [year, month]);

  async function handleAddPayment(e: React.FormEvent) {
    e.preventDefault();
    await fetch("/api/finance/payments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(paymentForm),
    });
    setShowPaymentForm(false);
    setPaymentForm({ projectId: "", amount: "", method: "CASH", notes: "", date: "" });
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
    fetchData();
  }

  const months = [
    "", "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
  ];

  return (
    <div className="space-y-4 pb-20 md:pb-0">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Finance</h1>
        <div className="flex gap-2">
          <select value={month} onChange={e => setMonth(e.target.value ? Number(e.target.value) : "")}
            className="px-2 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none">
            <option value="">Full Year</option>
            {months.slice(1).map((m, i) => <option key={i+1} value={i+1}>{m}</option>)}
          </select>
          <select value={year} onChange={e => setYear(Number(e.target.value))}
            className="px-2 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none">
            {[2024, 2025, 2026, 2027].map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
          <p className="text-xs text-gray-500">Revenue</p>
          <p className="text-2xl font-bold text-green-600 mt-1">{formatCurrency(data?.totalRevenue || 0)}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
          <p className="text-xs text-gray-500">Expenses</p>
          <p className="text-2xl font-bold text-red-600 mt-1">{formatCurrency(data?.totalExpenses || 0)}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
          <p className="text-xs text-gray-500">Net Profit</p>
          <p className={`text-2xl font-bold mt-1 ${(data?.netProfit || 0) >= 0 ? "text-gray-900" : "text-red-600"}`}>
            {formatCurrency(data?.netProfit || 0)}
          </p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
          <p className="text-xs text-gray-500">Jobs Completed</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{data?.projectCount || 0}</p>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex gap-2">
        <button onClick={() => setShowPaymentForm(!showPaymentForm)}
          className="flex items-center gap-1.5 bg-green-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-green-700">
          <Plus className="h-4 w-4" /> Record Payment
        </button>
        <button onClick={() => setShowExpenseForm(!showExpenseForm)}
          className="flex items-center gap-1.5 bg-red-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-red-700">
          <Plus className="h-4 w-4" /> Record Expense
        </button>
      </div>

      {/* Payment Form */}
      {showPaymentForm && (
        <form onSubmit={handleAddPayment} className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
          <h2 className="font-semibold mb-3">Record Payment</h2>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="text-xs font-medium text-gray-600">Project *</label>
              <select required value={paymentForm.projectId} onChange={e => setPaymentForm({...paymentForm, projectId: e.target.value})}
                className="w-full mt-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option value="">Select project...</option>
                {projects.map(p => <option key={p.id} value={p.id}>{p.title}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600">Amount ($) *</label>
              <input required type="number" step="0.01" value={paymentForm.amount}
                onChange={e => setPaymentForm({...paymentForm, amount: e.target.value})}
                className="w-full mt-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600">Method</label>
              <select value={paymentForm.method} onChange={e => setPaymentForm({...paymentForm, method: e.target.value})}
                className="w-full mt-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                {["CASH", "E_TRANSFER", "CHEQUE", "CARD"].map(m => <option key={m} value={m}>{m.replace("_", "-")}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600">Date</label>
              <input type="date" value={paymentForm.date} onChange={e => setPaymentForm({...paymentForm, date: e.target.value})}
                className="w-full mt-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600">Notes</label>
              <input value={paymentForm.notes} onChange={e => setPaymentForm({...paymentForm, notes: e.target.value})}
                className="w-full mt-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
          </div>
          <div className="flex gap-2 mt-3">
            <button type="submit" className="bg-green-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-green-700">Save</button>
            <button type="button" onClick={() => setShowPaymentForm(false)} className="border border-gray-300 text-gray-700 px-4 py-2 rounded-lg text-sm hover:bg-gray-50">Cancel</button>
          </div>
        </form>
      )}

      {/* Expense Form */}
      {showExpenseForm && (
        <form onSubmit={handleAddExpense} className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
          <h2 className="font-semibold mb-3">Record Expense</h2>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="text-xs font-medium text-gray-600">Project (optional)</label>
              <select value={expenseForm.projectId} onChange={e => setExpenseForm({...expenseForm, projectId: e.target.value})}
                className="w-full mt-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option value="">General expense</option>
                {projects.map(p => <option key={p.id} value={p.id}>{p.title}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600">Amount ($) *</label>
              <input required type="number" step="0.01" value={expenseForm.amount}
                onChange={e => setExpenseForm({...expenseForm, amount: e.target.value})}
                className="w-full mt-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600">Category</label>
              <select value={expenseForm.category} onChange={e => setExpenseForm({...expenseForm, category: e.target.value})}
                className="w-full mt-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                {["MATERIALS", "LABOR", "TOOLS", "VEHICLE", "OTHER"].map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600">Date</label>
              <input type="date" value={expenseForm.date} onChange={e => setExpenseForm({...expenseForm, date: e.target.value})}
                className="w-full mt-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600">Description</label>
              <input value={expenseForm.description} onChange={e => setExpenseForm({...expenseForm, description: e.target.value})}
                className="w-full mt-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
          </div>
          <div className="flex gap-2 mt-3">
            <button type="submit" className="bg-red-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-red-700">Save</button>
            <button type="button" onClick={() => setShowExpenseForm(false)} className="border border-gray-300 text-gray-700 px-4 py-2 rounded-lg text-sm hover:bg-gray-50">Cancel</button>
          </div>
        </form>
      )}

      {/* Tabs */}
      <div className="flex border-b border-gray-200 gap-1">
        {(["payments", "expenses"] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium capitalize border-b-2 transition-colors ${
              tab === t ? "border-blue-600 text-blue-600" : "border-transparent text-gray-500 hover:text-gray-700"
            }`}>
            {t} ({t === "payments" ? data?.payments.length || 0 : data?.expenses.length || 0})
          </button>
        ))}
      </div>

      {/* Payments List */}
      {tab === "payments" && (
        <div className="space-y-2">
          {(data?.payments || []).length === 0 ? (
            <p className="text-sm text-gray-500 p-4">No payments recorded.</p>
          ) : (
            data?.payments.map(p => (
              <div key={p.id} className="bg-white rounded-xl border border-gray-200 shadow-sm p-3 flex items-center justify-between">
                <div>
                  <p className="font-semibold text-green-600">{formatCurrency(p.amount)}</p>
                  <p className="text-xs text-gray-500">{p.project.clientName} · {p.project.title}</p>
                  <p className="text-xs text-gray-400">{p.method.replace("_", "-")} · {formatDate(p.date)}</p>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Expenses List */}
      {tab === "expenses" && (
        <div className="space-y-2">
          {(data?.expenses || []).length === 0 ? (
            <p className="text-sm text-gray-500 p-4">No expenses recorded.</p>
          ) : (
            data?.expenses.map(e => (
              <div key={e.id} className="bg-white rounded-xl border border-gray-200 shadow-sm p-3 flex items-center justify-between">
                <div>
                  <p className="font-semibold text-red-600">{formatCurrency(e.amount)}</p>
                  <p className="text-xs text-gray-500">{e.category}{e.project ? ` · ${e.project.title}` : ""}</p>
                  <p className="text-xs text-gray-400">{e.description || ""} · {formatDate(e.date)}</p>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
