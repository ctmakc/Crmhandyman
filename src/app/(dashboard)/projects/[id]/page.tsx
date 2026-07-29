"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Plus, FileText, Scissors } from "lucide-react";
import { formatCurrency, formatDate, cn } from "@/lib/utils";
import {
  Empty,
  buttonClass,
  spineFor,
  textToneFor,
  Plate,
  Skeleton,
  LaneHead,
} from "@/components/ui/primitives";
import { toast } from "@/components/ui/Toaster";
import { jobMoney, marginTone, marginVerdict } from "@/lib/margin";
import AddressHistory from "@/components/AddressHistory";

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
  clientId?: string | null;
  createdAt?: string;
  scheduledDate?: string;
  completedDate?: string;
  estimates: Estimate[];
  tasks: Task[];
  invoices: Invoice[];
  payments: Payment[];
  expenses: Expense[];
  lead?: { id: string; name: string; source: string };
  assignedToId?: string | null;
  assignedTo?: { id: string; name: string } | null;
}

interface Estimate {
  id: string;
  status: string;
  total: number;
  subtotal: number;
  tax: number;
  createdAt: string;
}

interface Invoice {
  id: string;
  number: string;
  status: string;
  total: number;
  dueDate: string | null;
  payments: { amount: number }[];
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

const TABS = ["overview", "invoices", "crew", "money"] as const;
type Tab = (typeof TABS)[number];

export default function ProjectDetailPage({ params }: { params: { id: string } }) {
  const [project, setProject] = useState<Project | null>(null);
  const [tab, setTab] = useState<Tab>("overview");
  const [paymentForm, setPaymentForm] = useState({ amount: "", method: "CASH", notes: "", date: "" });
  const [expenseForm, setExpenseForm] = useState({
    amount: "",
    category: "MATERIALS",
    description: "",
    date: "",
  });
  const [crew, setCrew] = useState<Array<{ id: string; name: string }>>([]);
  const [showPaymentForm, setShowPaymentForm] = useState(false);
  const [showExpenseForm, setShowExpenseForm] = useState(false);

  async function fetchProject() {
    const res = await fetch(`/api/projects/${params.id}`);
    const data = await res.json();
    setProject(data);
  }

  useEffect(() => {
    fetchProject();
    fetch("/api/settings/users")
      .then((r) => r.json())
      .then((d) => setCrew(Array.isArray(d) ? d : []))
      .catch(() => null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function assignTo(userId: string) {
    await fetch(`/api/projects/${params.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...project, assignedToId: userId || null }),
    });
    toast(userId ? "Job assigned" : "Assignment cleared");
    fetchProject();
  }

  async function handleStatusChange(status: string) {
    await fetch(`/api/projects/${params.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...project, status }),
    });
    toast(`Job marked ${status.replace("_", " ").toLowerCase()}`);
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
    toast("Payment recorded");
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
    toast("Cost recorded");
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

  if (!project) return <Skeleton lines={5} />;

  const totalPaid = project.payments.reduce((s, p) => s + p.amount, 0);
  const totalExpenses = project.expenses.reduce((s, e) => s + e.amount, 0);
  const money = jobMoney(project);
  const invoices = project.invoices ?? [];
  const acceptedEstimate = project.estimates.find((e) => e.status === "ACCEPTED");
  const field = "w-full mt-1.5 px-3 py-2 text-[13px]";

  return (
    <div className="mx-auto max-w-4xl space-y-6 pb-24 md:pb-0">
      <Link href="/projects" className="eyebrow inline-flex items-center gap-1.5 hover:text-ink">
        <ArrowLeft className="h-3.5 w-3.5" /> All jobs
      </Link>

      {/* Job header rendered as the work-order plate itself. */}
      <div
        className="plate px-5 py-5"
        style={{ borderLeft: `4px solid ${spineFor(project.status)}` }}
      >
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <span className="mono text-[11px] tracking-[0.08em] text-ink-3">
              WO-{new Date(project.createdAt || Date.now()).getFullYear()}-
              {project.id.slice(-4).toUpperCase()}
            </span>
            <h1 className="mt-1.5 text-[26px] font-black leading-none tracking-tight text-ink">
              {project.title}
            </h1>
            <p className="mt-2 text-[14px] text-ink-2">
              {project.clientId ? (
                <Link
                  href={`/clients/${project.clientId}`}
                  className="font-medium text-ink underline underline-offset-4"
                >
                  {project.clientName}
                </Link>
              ) : (
                project.clientName
              )}{" "}
              · {project.address}
            </p>
          </div>
          <span className="eyebrow" style={{ color: textToneFor(project.status) }}>
            {project.status.replace("_", " ")}
          </span>
        </div>

        <div className="mt-5 flex flex-wrap gap-2 border-t border-line pt-4">
          {project.status === "SCHEDULED" && (
            <button onClick={() => handleStatusChange("IN_PROGRESS")} className={buttonClass("primary")}>
              Start job
            </button>
          )}
          {project.status === "IN_PROGRESS" && (
            <button onClick={() => handleStatusChange("COMPLETED")} className={buttonClass("primary")}>
              Mark complete
            </button>
          )}
          <Link href={`/projects/${project.id}/estimate`} className={buttonClass("ghost")}>
            <FileText className="h-4 w-4" />
            {project.estimates.length > 0 ? "Estimates" : "Create estimate"}
          </Link>
          {acceptedEstimate && (
            <Link href={`/projects/${project.id}/estimate`} className={buttonClass("ghost")}>
              <Scissors className="h-4 w-4" /> Issue invoice
            </Link>
          )}

          {/* The tech who owns this job. Field mode and the crew-load readout both
              read this — until it is set, a worker's Today is empty. */}
          <label className="ml-auto flex items-center gap-2">
            <span className="eyebrow">Crew</span>
            <select
              value={project.assignedToId || ""}
              onChange={(e) => assignTo(e.target.value)}
              className="mono px-2.5 py-2 text-[12px] uppercase tracking-[0.06em]"
            >
              <option value="">— Unassigned —</option>
              {crew.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      {/* Tabs — ruled, not pills. */}
      <div className="flex gap-6 border-b border-line">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              "-mb-px border-b-2 pb-2.5 text-[12px] font-bold uppercase tracking-[0.08em] transition-colors duration-[140ms] ease-instrument",
              tab === t
                ? "border-navy-900 text-ink"
                : "border-transparent text-ink-3 hover:text-ink-2"
            )}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === "overview" && (
        <div className="space-y-5">
          <AddressHistory projectId={params.id} />
          <div className="border-t border-line">
            {[
              ["Address", project.address],
              ["Phone", project.phone],
              ["Email", project.email],
              ["Job type", project.jobType],
              ["Scheduled", project.scheduledDate ? formatDate(project.scheduledDate) : null],
              ["From lead", project.lead ? `${project.lead.name} · ${project.lead.source}` : null],
            ]
              .filter(([, v]) => v)
              .map(([k, v]) => (
                <div key={k as string} className="flex gap-4 border-b border-line px-1 py-3">
                  <span className="eyebrow w-[110px] shrink-0 pt-0.5">{k}</span>
                  <span className="text-[14px] text-ink">{v}</span>
                </div>
              ))}
            {project.description && (
              <p className="border-b border-line px-1 py-3 text-[13px] text-ink-2">
                {project.description}
              </p>
            )}
          </div>

          {/* Did this job make money — the four numbers, then the verdict. */}
          <section>
            <LaneHead title="Job economics" />
            <div className="grid grid-cols-2 gap-x-8 gap-y-6 border-t border-line pt-5 md:grid-cols-4">
              {[
                { label: "Quoted", value: formatCurrency(money.quoted) },
                { label: "Invoiced", value: formatCurrency(money.invoiced) },
                { label: "Collected", value: formatCurrency(money.collected), tone: "var(--emerald-ink)" },
                { label: "Costs", value: formatCurrency(money.costs), tone: "var(--rose-ink)" },
              ].map((r) => (
                <div key={r.label}>
                  <div className="eyebrow">{r.label}</div>
                  <p
                    className="mono mt-1.5 text-[22px] font-bold leading-none"
                    style={{ color: r.tone || "var(--ink)" }}
                  >
                    {r.value}
                  </p>
                </div>
              ))}
            </div>

            <div className="mt-6 flex flex-wrap items-end justify-between gap-4 border-t border-line pt-5">
              <div>
                <div className="eyebrow">Margin — collected minus costs</div>
                <p className="mt-1 text-[13px] text-ink-2">{marginVerdict(money)}</p>
                {money.unbilled > 0.005 && (
                  <p className="mt-1 text-[13px]" style={{ color: "var(--amber-ink)" }}>
                    {formatCurrency(money.unbilled)} quoted but never invoiced
                  </p>
                )}
                {money.outstanding > 0.005 && (
                  <p className="mt-1 text-[13px]" style={{ color: "var(--rose-ink)" }}>
                    {formatCurrency(money.outstanding)} billed and still on the street
                  </p>
                )}
              </div>
              <div className="text-right">
                <span
                  className="mono block text-[30px] font-bold leading-none"
                  style={{ color: marginTone(money.marginPct) }}
                >
                  {formatCurrency(money.margin)}
                </span>
                {money.marginPct !== null && (
                  <span
                    className="mono mt-1 block text-[13px]"
                    style={{ color: marginTone(money.marginPct) }}
                  >
                    {money.marginPct.toFixed(0)}%
                  </span>
                )}
              </div>
            </div>
          </section>
        </div>
      )}

      {tab === "invoices" && (
        <div className="space-y-2.5">
          {invoices.length === 0 ? (
            <Empty>
              {acceptedEstimate
                ? "Estimate accepted — issue an invoice from the estimates page"
                : "No invoices — an accepted estimate becomes one"}
            </Empty>
          ) : (
            invoices.map((inv) => {
              const paid = inv.payments.reduce((s, p) => s + p.amount, 0);
              return (
                <Link
                  key={inv.id}
                  href={`/invoices/${inv.id}`}
                  className="ticket block px-4 py-3"
                  style={{ ["--spine" as string]: spineFor(inv.status) } as React.CSSProperties}
                >
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="mono text-[11px] font-bold tracking-[0.08em] text-ink-2">
                      {inv.number}
                    </span>
                    <span className="eyebrow" style={{ color: textToneFor(inv.status) }}>
                      {inv.status}
                    </span>
                  </div>
                  <div className="mt-1.5 flex items-baseline justify-between gap-3">
                    <span className="text-[13px] text-ink-2">
                      {inv.dueDate ? `Due ${formatDate(inv.dueDate)}` : "No due date"}
                    </span>
                    <span className="mono text-[16px] font-medium text-ink">
                      {formatCurrency(inv.total)}
                      {paid > 0 && paid < inv.total && (
                        <span className="ml-2 text-[11px] text-ink-3">
                          paid {formatCurrency(paid)}
                        </span>
                      )}
                    </span>
                  </div>
                </Link>
              );
            })
          )}
        </div>
      )}

      {tab === "crew" && (
        <div className="space-y-2.5">
          {project.tasks.length === 0 ? (
            <Empty>No crew tasks on this job</Empty>
          ) : (
            project.tasks.map((task) => (
              <div
                key={task.id}
                className="ticket ticket-hover flex items-center justify-between gap-3 px-4 py-3"
                style={{ ["--spine" as string]: spineFor(task.status) } as React.CSSProperties}
              >
                <div className="min-w-0">
                  <p className="text-[14px] font-bold text-ink">{task.title}</p>
                  <p className="text-[12px] text-ink-2">
                    {task.assignedTo.name}
                    {task.dueDate ? ` · due ${formatDate(task.dueDate)}` : ""}
                  </p>
                </div>
                <select
                  value={task.status}
                  onChange={(e) => handleTaskStatusChange(task.id, e.target.value)}
                  className="mono shrink-0 px-2 py-1 text-[11px] uppercase tracking-[0.06em]"
                >
                  <option value="TODO">TODO</option>
                  <option value="IN_PROGRESS">IN PROGRESS</option>
                  <option value="DONE">DONE</option>
                </select>
              </div>
            ))
          )}
        </div>
      )}

      {tab === "money" && (
        <div className="space-y-6">
          <section className="space-y-2.5">
            <div className="flex items-center justify-between">
              <h2 className="eyebrow">Payments in</h2>
              <button
                onClick={() => setShowPaymentForm(!showPaymentForm)}
                className={buttonClass("ghost")}
              >
                <Plus className="h-3.5 w-3.5" /> Payment
              </button>
            </div>

            {showPaymentForm && (
              <Plate className="p-4">
                <form onSubmit={handleAddPayment} className="grid grid-cols-2 gap-4">
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
                      Record
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

            {project.payments.length === 0 ? (
              <Empty>Nothing collected yet</Empty>
            ) : (
              <div className="border-t border-line">
                {project.payments.map((p) => (
                  <div
                    key={p.id}
                    className="flex items-center justify-between border-b border-line px-1 py-2.5"
                  >
                    <span className="mono text-[12px] text-ink-3">
                      {formatDate(p.date)} · {p.method.replace("_", "-")}
                      {p.notes ? ` · ${p.notes}` : ""}
                    </span>
                    <span className="mono text-[14px] font-medium" style={{ color: "var(--emerald-ink)" }}>
                      {formatCurrency(p.amount)}
                    </span>
                  </div>
                ))}
                <div className="flex items-center justify-between px-1 py-2.5">
                  <span className="eyebrow">Total in</span>
                  <span className="mono text-[15px] font-bold" style={{ color: "var(--emerald-ink)" }}>
                    {formatCurrency(totalPaid)}
                  </span>
                </div>
              </div>
            )}
          </section>

          <section className="space-y-2.5">
            <div className="flex items-center justify-between">
              <h2 className="eyebrow">Costs out</h2>
              <button
                onClick={() => setShowExpenseForm(!showExpenseForm)}
                className={buttonClass("ghost")}
              >
                <Plus className="h-3.5 w-3.5" /> Expense
              </button>
            </div>

            {showExpenseForm && (
              <Plate className="p-4">
                <form onSubmit={handleAddExpense} className="grid grid-cols-2 gap-4">
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
                      onChange={(e) =>
                        setExpenseForm({ ...expenseForm, description: e.target.value })
                      }
                      className={field}
                    />
                  </div>
                  <div className="col-span-2 flex gap-2">
                    <button type="submit" className={buttonClass("primary")}>
                      Record
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

            {project.expenses.length === 0 ? (
              <Empty>No costs logged</Empty>
            ) : (
              <div className="border-t border-line">
                {project.expenses.map((e) => (
                  <div
                    key={e.id}
                    className="flex items-center justify-between border-b border-line px-1 py-2.5"
                  >
                    <span className="mono text-[12px] text-ink-3">
                      {formatDate(e.date)} · {e.category}
                      {e.description ? ` · ${e.description}` : ""}
                    </span>
                    <span className="mono text-[14px] font-medium" style={{ color: "var(--rose-ink)" }}>
                      {formatCurrency(e.amount)}
                    </span>
                  </div>
                ))}
                <div className="flex items-center justify-between px-1 py-2.5">
                  <span className="eyebrow">Total out</span>
                  <span className="mono text-[15px] font-bold" style={{ color: "var(--rose-ink)" }}>
                    {formatCurrency(totalExpenses)}
                  </span>
                </div>
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
