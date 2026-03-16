"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Plus, FileText } from "lucide-react";
import { formatCurrency, formatDate } from "@/lib/utils";

interface Project {
  id: string;
  title: string;
  clientName: string;
  phone?: string;
  email?: string;
  address: string;
  description?: string;
  jobType?: string;
  status: string;
  scheduledDate?: string;
  completedDate?: string;
  estimates: Estimate[];
  tasks: Task[];
  payments: Payment[];
  expenses: Expense[];
  lead?: { id: string; name: string; source: string };
}

interface Estimate {
  id: string;
  status: string;
  total: number;
  subtotal: number;
  tax: number;
  createdAt: string;
}

interface Task {
  id: string;
  title: string;
  status: string;
  dueDate?: string;
  assignedTo: { id: string; name: string };
}

interface Payment {
  id: string;
  amount: number;
  method: string;
  date: string;
  notes?: string;
}

interface Expense {
  id: string;
  amount: number;
  category: string;
  description?: string;
  date: string;
}

const statusColors: Record<string, string> = {
  SCHEDULED: "bg-yellow-100 text-yellow-700",
  IN_PROGRESS: "bg-blue-100 text-blue-700",
  COMPLETED: "bg-green-100 text-green-700",
  CANCELLED: "bg-red-100 text-red-700",
};

const taskStatusColors: Record<string, string> = {
  TODO: "bg-gray-100 text-gray-600",
  IN_PROGRESS: "bg-blue-100 text-blue-700",
  DONE: "bg-green-100 text-green-700",
};

export default function ProjectDetailPage({ params }: { params: { id: string } }) {
  const [project, setProject] = useState<Project | null>(null);
  const [tab, setTab] = useState<"overview" | "tasks" | "payments" | "expenses">("overview");
  const [paymentForm, setPaymentForm] = useState({ amount: "", method: "CASH", notes: "", date: "" });
  const [expenseForm, setExpenseForm] = useState({ amount: "", category: "MATERIALS", description: "", date: "" });
  const [showPaymentForm, setShowPaymentForm] = useState(false);
  const [showExpenseForm, setShowExpenseForm] = useState(false);

  async function fetchProject() {
    const res = await fetch(`/api/projects/${params.id}`);
    const data = await res.json();
    setProject(data);
  }

  useEffect(() => { fetchProject(); }, []);

  async function handleStatusChange(status: string) {
    await fetch(`/api/projects/${params.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...project, status }),
    });
    fetchProject();
  }

  async function handleAddPayment(e: React.FormEvent) {
    e.preventDefault();
    await fetch("/api/finance/payments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...paymentForm, projectId: params.id }),
    });
    setPaymentForm({ amount: "", method: "CASH", notes: "", date: "" });
    setShowPaymentForm(false);
    fetchProject();
  }

  async function handleAddExpense(e: React.FormEvent) {
    e.preventDefault();
    await fetch("/api/finance/expenses", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...expenseForm, projectId: params.id }),
    });
    setExpenseForm({ amount: "", category: "MATERIALS", description: "", date: "" });
    setShowExpenseForm(false);
    fetchProject();
  }

  async function handleTaskStatusChange(taskId: string, status: string) {
    await fetch(`/api/tasks/${taskId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    fetchProject();
  }

  if (!project) return <div className="p-4 text-gray-500">Loading...</div>;

  const totalPaid = project.payments.reduce((s, p) => s + p.amount, 0);
  const totalExpenses = project.expenses.reduce((s, e) => s + e.amount, 0);
  const latestEstimate = project.estimates[0];

  return (
    <div className="max-w-3xl mx-auto space-y-4 pb-20 md:pb-0">
      <div className="flex items-center gap-3">
        <Link href="/projects" className="text-gray-500 hover:text-gray-900">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-bold text-gray-900 truncate">{project.title}</h1>
          <p className="text-sm text-gray-500">{project.clientName}</p>
        </div>
        <span className={`shrink-0 text-xs px-2 py-1 rounded-full font-medium ${statusColors[project.status]}`}>
          {project.status.replace("_", " ")}
        </span>
      </div>

      {/* Status Actions */}
      <div className="flex flex-wrap gap-2">
        {project.status === "SCHEDULED" && (
          <button onClick={() => handleStatusChange("IN_PROGRESS")}
            className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700">
            Start Job
          </button>
        )}
        {project.status === "IN_PROGRESS" && (
          <button onClick={() => handleStatusChange("COMPLETED")}
            className="px-3 py-1.5 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700">
            Mark Complete
          </button>
        )}
        <Link href={`/projects/${project.id}/estimate`}
          className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-300 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50">
          <FileText className="h-4 w-4" />
          {project.estimates.length > 0 ? "View Estimate" : "Create Estimate"}
        </Link>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-200 gap-1">
        {(["overview", "tasks", "payments", "expenses"] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium capitalize border-b-2 transition-colors ${
              tab === t ? "border-blue-600 text-blue-600" : "border-transparent text-gray-500 hover:text-gray-700"
            }`}>
            {t}
          </button>
        ))}
      </div>

      {/* Overview Tab */}
      {tab === "overview" && (
        <div className="space-y-4">
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 space-y-2 text-sm">
            <p><span className="text-gray-500">Address:</span> {project.address}</p>
            {project.phone && <p><span className="text-gray-500">Phone:</span> <a href={`tel:${project.phone}`} className="text-blue-600">{project.phone}</a></p>}
            {project.email && <p><span className="text-gray-500">Email:</span> <a href={`mailto:${project.email}`} className="text-blue-600">{project.email}</a></p>}
            {project.jobType && <p><span className="text-gray-500">Job Type:</span> {project.jobType}</p>}
            {project.scheduledDate && <p><span className="text-gray-500">Scheduled:</span> {formatDate(project.scheduledDate)}</p>}
            {project.description && <p className="text-gray-600 bg-gray-50 p-2 rounded">{project.description}</p>}
          </div>

          {/* Finance Summary */}
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-3 text-center">
              <p className="text-xs text-gray-500">Estimate</p>
              <p className="font-bold text-gray-900">{latestEstimate ? formatCurrency(latestEstimate.total) : "—"}</p>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-3 text-center">
              <p className="text-xs text-gray-500">Received</p>
              <p className="font-bold text-green-600">{formatCurrency(totalPaid)}</p>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-3 text-center">
              <p className="text-xs text-gray-500">Expenses</p>
              <p className="font-bold text-red-600">{formatCurrency(totalExpenses)}</p>
            </div>
          </div>
        </div>
      )}

      {/* Tasks Tab */}
      {tab === "tasks" && (
        <div className="space-y-3">
          {project.tasks.length === 0 ? (
            <p className="text-sm text-gray-500 bg-white rounded-xl border border-gray-200 p-4">No tasks yet. Go to the Tasks page to add tasks for this project.</p>
          ) : (
            project.tasks.map(task => (
              <div key={task.id} className="bg-white rounded-xl border border-gray-200 shadow-sm p-3 flex items-center justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-gray-900 text-sm">{task.title}</p>
                  <p className="text-xs text-gray-500">{task.assignedTo.name}{task.dueDate ? ` · Due: ${formatDate(task.dueDate)}` : ""}</p>
                </div>
                <select value={task.status}
                  onChange={e => handleTaskStatusChange(task.id, e.target.value)}
                  className={`text-xs px-2 py-1 rounded-full font-medium border-0 ${taskStatusColors[task.status]}`}>
                  <option value="TODO">TODO</option>
                  <option value="IN_PROGRESS">IN PROGRESS</option>
                  <option value="DONE">DONE</option>
                </select>
              </div>
            ))
          )}
        </div>
      )}

      {/* Payments Tab */}
      {tab === "payments" && (
        <div className="space-y-3">
          <button onClick={() => setShowPaymentForm(!showPaymentForm)}
            className="flex items-center gap-1.5 bg-green-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-green-700">
            <Plus className="h-4 w-4" /> Add Payment
          </button>
          {showPaymentForm && (
            <form onSubmit={handleAddPayment} className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
              <div className="grid grid-cols-2 gap-3">
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
              <div className="flex gap-2">
                <button type="submit" className="bg-green-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-green-700">Add</button>
                <button type="button" onClick={() => setShowPaymentForm(false)} className="border border-gray-300 text-gray-700 px-4 py-2 rounded-lg text-sm hover:bg-gray-50">Cancel</button>
              </div>
            </form>
          )}
          <div className="space-y-2">
            {project.payments.map(p => (
              <div key={p.id} className="bg-white rounded-xl border border-gray-200 shadow-sm p-3 flex items-center justify-between">
                <div>
                  <p className="font-medium text-green-600">{formatCurrency(p.amount)}</p>
                  <p className="text-xs text-gray-500">{p.method.replace("_", "-")} · {formatDate(p.date)}{p.notes ? ` · ${p.notes}` : ""}</p>
                </div>
              </div>
            ))}
            {project.payments.length === 0 && <p className="text-sm text-gray-500">No payments recorded.</p>}
            {project.payments.length > 0 && (
              <div className="bg-green-50 rounded-xl border border-green-200 p-3 text-right">
                <p className="font-bold text-green-700">Total: {formatCurrency(totalPaid)}</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Expenses Tab */}
      {tab === "expenses" && (
        <div className="space-y-3">
          <button onClick={() => setShowExpenseForm(!showExpenseForm)}
            className="flex items-center gap-1.5 bg-red-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-red-700">
            <Plus className="h-4 w-4" /> Add Expense
          </button>
          {showExpenseForm && (
            <form onSubmit={handleAddExpense} className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
              <div className="grid grid-cols-2 gap-3">
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
              <div className="flex gap-2">
                <button type="submit" className="bg-red-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-red-700">Add</button>
                <button type="button" onClick={() => setShowExpenseForm(false)} className="border border-gray-300 text-gray-700 px-4 py-2 rounded-lg text-sm hover:bg-gray-50">Cancel</button>
              </div>
            </form>
          )}
          <div className="space-y-2">
            {project.expenses.map(e => (
              <div key={e.id} className="bg-white rounded-xl border border-gray-200 shadow-sm p-3 flex items-center justify-between">
                <div>
                  <p className="font-medium text-red-600">{formatCurrency(e.amount)}</p>
                  <p className="text-xs text-gray-500">{e.category} · {formatDate(e.date)}{e.description ? ` · ${e.description}` : ""}</p>
                </div>
              </div>
            ))}
            {project.expenses.length === 0 && <p className="text-sm text-gray-500">No expenses recorded.</p>}
            {project.expenses.length > 0 && (
              <div className="bg-red-50 rounded-xl border border-red-200 p-3 text-right">
                <p className="font-bold text-red-700">Total: {formatCurrency(totalExpenses)}</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
