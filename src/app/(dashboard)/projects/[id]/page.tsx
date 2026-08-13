"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Plus, FileText, Scissors } from "lucide-react";
import { formatDate, cn } from "@/lib/utils";
import { dayStamp } from "@/lib/dates";
import { formatCents, inCents, type InCents } from "@/lib/money";
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
import {
  DEFAULT_SLOT_MINUTES,
  DURATION_CHOICES,
  conflictsFor,
  formatDuration,
  spanDays,
  type ScheduleJob,
} from "@/lib/schedule";
import { jobMoney, marginTone, marginVerdict } from "@/lib/margin";
import AddressHistory from "@/components/AddressHistory";
import JobPhotos from "@/components/JobPhotos";

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
  /** How long the work holds the crew. Hours for a mover, days for a renovation. */
  durationMinutes?: number | null;
  completedDate?: string;
  estimates: Estimate[];
  tasks: Task[];
  invoices: Invoice[];
  payments: Payment[];
  expenses: Expense[];
  lead?: { id: string; name: string; source: string };
  assignedToId?: string | null;
  assignedTo?: { id: string; name: string } | null;
  /** Sent by the API: the crew is served a card with the money stripped out. */
  viewerRole?: "ADMIN" | "WORKER";
  /** The one figure the crew keeps: what this job still owes, for collecting at the door. */
  dueAtDoorCents?: number;
}

interface ApiEstimate {
  id: string;
  status: string;
  total: number;
  subtotal: number;
  tax: number;
  createdAt: string;
}

interface ApiInvoice {
  id: string;
  number: string;
  status: string;
  total: number;
  dueDate: string | null;
  payments: { amount: number }[];
}

type Estimate = InCents<ApiEstimate>;
type Invoice = InCents<ApiInvoice>;

interface Task {
  id: string;
  title: string;
  status: string;
  dueDate?: string;
  assignedTo: { id: string; name: string };
}

interface ApiPayment {
  id: string;
  amount: number;
  method: string;
  date: string;
  notes?: string;
}

interface ApiExpense {
  id: string;
  amount: number;
  category: string;
  description?: string;
  date: string;
}

type Payment = InCents<ApiPayment>;
type Expense = InCents<ApiExpense>;

/** A neighbouring booking on the same day — enough of it to name the collision. */
interface DayJob {
  id: string;
  title: string;
  clientName: string;
  status: string;
  scheduledDate: string | null;
  durationMinutes: number | null;
  assignedToId: string | null;
  assignedTo?: { id: string; name: string } | null;
}

/**
 * A day and an optional clock, as the API takes them. A day on its own becomes local
 * midnight, which is how this system spells «that day, time not agreed yet».
 */
function composeSlot(date: string, time: string): string | null {
  if (!date) return null;
  return time ? `${date}T${time}` : date;
}

/** `09:30` for a `<input type="time">` — the shop's local clock, never UTC. */
function clockOf(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** `Aug 14 · 09:00–12:00`, or the day and its run when nobody named a time. */
function whenLabel(job: { scheduledDate: string | null; durationMinutes?: number | null }) {
  if (!job.scheduledDate) return "unscheduled";
  const d = new Date(job.scheduledDate);
  const day = formatDate(job.scheduledDate);
  const runs = spanDays(job as ScheduleJob);
  const timed = d.getHours() !== 0 || d.getMinutes() !== 0;

  if (runs > 1) return `${day}${timed ? ` ${clockOf(d)}` : ""} · ${runs} days`;
  if (!timed) return `${day} · anytime`;

  const end = new Date(d.getTime() + (job.durationMinutes ?? DEFAULT_SLOT_MINUTES) * 60_000);
  return `${day} · ${clockOf(d)}–${clockOf(end)}`;
}

const TABS = ["overview", "invoices", "crew", "money"] as const;
type Tab = (typeof TABS)[number];

/** What the crew gets: the work and the day's cash, without the books behind them. */
const FIELD_TABS: Tab[] = ["overview", "crew", "money"];

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
  /** The rest of that day's board — what a new assignment would collide with. */
  const [daySchedule, setDaySchedule] = useState<DayJob[]>([]);
  /** An assignment the dispatcher has been warned about and has not confirmed yet. */
  const [pending, setPending] = useState<{ userId: string; clashes: DayJob[] } | null>(null);
  /** The dispatch strip works on its own draft so a half-typed date never posts. */
  const [slot, setSlot] = useState({ date: "", time: "", duration: "" });

  async function fetchProject() {
    const res = await fetch(`/api/projects/${params.id}`);
    // The one door on this screen: the API answers in dollars, the card works in cents.
    // The two forms below are the other direction — they post what the owner typed.
    const data = inCents(await res.json());
    setProject(data);
    const booked = data.scheduledDate ? new Date(data.scheduledDate) : null;
    setSlot({
      date: booked ? dayStamp(booked) : "",
      // Midnight is what a date-only booking lands on: nobody named a time, so the
      // field reads ANYTIME rather than lying about a 12am appointment.
      time: booked && (booked.getHours() || booked.getMinutes()) ? clockOf(booked) : "",
      duration: data.durationMinutes ? String(data.durationMinutes) : "",
    });
  }

  useEffect(() => {
    fetchProject();
    fetch("/api/settings/users")
      .then((r) => r.json())
      .then((d) => setCrew(Array.isArray(d) ? d : []))
      .catch(() => null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** The rest of that day's board — every job running through it, this one aside. */
  async function loadDay(date: string) {
    if (!date) {
      setDaySchedule([]);
      return;
    }
    try {
      const res = await fetch(`/api/projects?window=day&date=${date}`);
      const rows = res.ok ? await res.json() : null;
      if (Array.isArray(rows)) setDaySchedule(rows.filter((j: DayJob) => j.id !== params.id));
    } catch {
      /* the warning goes quiet rather than the page */
    }
  }

  // Reloaded whenever the job moves, because a warning computed against yesterday's
  // board is worse than no warning at all.
  useEffect(() => {
    loadDay(slot.date);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slot.date, params.id]);

  /** One door for every dispatch write: date, run length and who drives there. */
  async function saveDispatch(patch: Record<string, unknown>, note: string) {
    await fetch(`/api/projects/${params.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...project, ...patch }),
    });
    setPending(null);
    toast(note);
    fetchProject();
    // The day is re-read after every dispatch: another desk may have booked this tech
    // while the card sat open, and the standing warning has to know about it.
    loadDay(typeof patch.scheduledDate === "string" ? patch.scheduledDate.slice(0, 10) : slot.date);
  }

  /** This job as the schedule library reads it, with `who` standing in for the assignee. */
  function asScheduled(who: string | null): ScheduleJob {
    return {
      id: params.id,
      scheduledDate: composeSlot(slot.date, slot.time),
      durationMinutes: slot.duration ? Number(slot.duration) : null,
      assignedToId: who,
      status: project?.status,
    };
  }

  /**
   * Assignment warns, never refuses. Two short moving jobs on one man in one afternoon
   * is a normal Saturday — the dispatcher is told who else that man is already on and
   * then puts him there anyway if he means it.
   */
  function assignTo(userId: string) {
    if (!userId) {
      saveDispatch({ assignedToId: null }, "Assignment cleared");
      return;
    }
    const clashes = conflictsFor(asScheduled(userId), daySchedule);
    if (clashes.length) {
      setPending({ userId, clashes });
      return;
    }
    saveDispatch({ assignedToId: userId }, "Job assigned");
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

  const paidCents = project.payments.reduce((s, p) => s + p.amountCents, 0);
  const expensesCents = project.expenses.reduce((s, e) => s + e.amountCents, 0);
  const money = jobMoney(project);
  const invoices = project.invoices ?? [];
  // The API already withholds the numbers from a worker; the page stops drawing empty
  // frames around the hole and stops offering controls the answer would refuse.
  const ownerView = project.viewerRole !== "WORKER";
  // What the current, saved assignment collides with — the card has to keep saying it.
  const standingClashes = conflictsFor(asScheduled(project.assignedToId ?? null), daySchedule);
  const tabs = ownerView ? TABS : FIELD_TABS;
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
          {ownerView && (
            <Link href={`/projects/${project.id}/estimate`} className={buttonClass("ghost")}>
              <FileText className="h-4 w-4" />
              {project.estimates.length > 0 ? "Estimates" : "Create estimate"}
            </Link>
          )}
          {ownerView && acceptedEstimate && (
            <Link href={`/projects/${project.id}/estimate`} className={buttonClass("ghost")}>
              <Scissors className="h-4 w-4" /> Issue invoice
            </Link>
          )}

          {!ownerView && project.assignedTo && (
            <span className="eyebrow ml-auto self-center">Crew · {project.assignedTo.name}</span>
          )}
        </div>

        {/* THE DISPATCH STRIP — when it runs, how long it runs, who runs it.
            Dispatch is the owner's call: the crew select used to sit here for the field
            too, empty, and one tap on «— Unassigned —» took the tech off his own work
            order. The date lived in the read-only list below, so a job could not be moved
            at all once it was opened. */}
        {ownerView && (
          <div className="mt-4 flex flex-wrap items-end gap-x-5 gap-y-3 border-t border-line pt-4">
            <label className="flex flex-col gap-1.5">
              <span className="eyebrow">Day</span>
              <input
                type="date"
                value={slot.date}
                onChange={(e) => {
                  const next = { ...slot, date: e.target.value };
                  setSlot(next);
                  if (next.date)
                    saveDispatch(
                      { scheduledDate: composeSlot(next.date, next.time) },
                      "Job rebooked"
                    );
                }}
                className="mono px-2.5 py-2 text-[12px]"
              />
            </label>

            <label className="flex flex-col gap-1.5">
              <span className="eyebrow">Start</span>
              <input
                type="time"
                value={slot.time}
                onChange={(e) => {
                  const next = { ...slot, time: e.target.value };
                  setSlot(next);
                  if (next.date)
                    saveDispatch(
                      { scheduledDate: composeSlot(next.date, next.time) },
                      next.time ? `Start set ${next.time}` : "Start time cleared"
                    );
                }}
                className="mono px-2.5 py-2 text-[12px]"
              />
            </label>

            {/* Two trades, one ruler: a mover books hours of this day, a renovation
                books days, and the week rail draws whatever comes out as one run. */}
            <label className="flex flex-col gap-1.5">
              <span className="eyebrow">Takes</span>
              <select
                value={slot.duration}
                onChange={(e) => {
                  setSlot({ ...slot, duration: e.target.value });
                  saveDispatch(
                    { durationMinutes: e.target.value ? Number(e.target.value) : null },
                    e.target.value
                      ? `Runs ${formatDuration(Number(e.target.value))}`
                      : "Duration cleared"
                  );
                }}
                className="mono px-2.5 py-2 text-[12px] uppercase tracking-[0.06em]"
              >
                <option value="">— One stop —</option>
                {DURATION_CHOICES.map((d) => (
                  <option key={d.minutes} value={d.minutes}>
                    {d.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex flex-col gap-1.5 sm:ml-auto">
              <span className="eyebrow">Crew</span>
              <select
                value={pending?.userId ?? project.assignedToId ?? ""}
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
        )}

        {/* DOUBLE BOOKING — the warning is a report with a way forward, never a refusal.
            Two short moving jobs on one man in one afternoon is a normal Saturday. */}
        {ownerView && pending && (
          <div
            className="mt-4 border-t border-line pt-4"
            style={{ borderTopColor: "var(--rose)" }}
            role="alert"
          >
            <div className="eyebrow" style={{ color: "var(--rose-ink)" }}>
              Double booking
            </div>
            <p className="mt-1.5 text-[13px] text-ink">
              {crew.find((c) => c.id === pending.userId)?.name ?? "That tech"} is already on{" "}
              {pending.clashes.length} job{pending.clashes.length === 1 ? "" : "s"} at the same
              time:
            </p>
            <ul className="mt-2 space-y-1">
              {pending.clashes.map((c) => (
                <li key={c.id} className="text-[13px] text-ink-2">
                  <Link
                    href={`/projects/${c.id}`}
                    className="font-medium text-ink underline underline-offset-4"
                  >
                    {c.title}
                  </Link>{" "}
                  · {c.clientName} ·{" "}
                  <span className="mono text-[12px]">{whenLabel(c)}</span>
                </li>
              ))}
            </ul>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                onClick={() => saveDispatch({ assignedToId: pending.userId }, "Assigned anyway")}
                className={buttonClass("danger")}
              >
                Assign anyway
              </button>
              <button onClick={() => setPending(null)} className={buttonClass("ghost")}>
                Leave as is
              </button>
            </div>
          </div>
        )}

        {/* Already double booked, saved and true — the card says so on every visit,
            not only in the second the dispatcher pressed the button. */}
        {ownerView && !pending && standingClashes.length > 0 && (
          <p
            className="mono mt-3 border-t border-line pt-3 text-[11px] uppercase tracking-[0.08em]"
            style={{ color: "var(--rose-ink)" }}
          >
            ! {project.assignedTo?.name ?? "This tech"} also holds{" "}
            {standingClashes.map((c) => c.title).join(" · ")} at this time
          </p>
        )}
      </div>

      {/* Tabs — ruled, not pills. */}
      <div className="flex gap-6 border-b border-line">
        {tabs.map((t) => (
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
              [
                "Scheduled",
                project.scheduledDate
                  ? whenLabel({
                      scheduledDate: project.scheduledDate,
                      durationMinutes: project.durationMinutes ?? null,
                    })
                  : null,
              ],
              [
                "Crew",
                project.assignedTo
                  ? project.assignedTo.name
                  : project.scheduledDate
                    ? "Nobody assigned yet"
                    : null,
              ],
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

          <JobPhotos projectId={params.id} />

          {/* Did this job make money — the four numbers, then the verdict. */}
          {ownerView && (
          <section>
            <LaneHead title="Job economics" />
            <div className="grid grid-cols-2 gap-x-8 gap-y-6 border-t border-line pt-5 md:grid-cols-4">
              {[
                { label: "Quoted", value: formatCents(money.quotedCents) },
                { label: "Invoiced", value: formatCents(money.invoicedCents) },
                {
                  label: "Collected",
                  value: formatCents(money.collectedCents),
                  tone: "var(--emerald-ink)",
                },
                { label: "Costs", value: formatCents(money.costsCents), tone: "var(--rose-ink)" },
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
                {money.unbilledCents > 0 && (
                  <p className="mt-1 text-[13px]" style={{ color: "var(--amber-ink)" }}>
                    {formatCents(money.unbilledCents)} quoted but never invoiced
                  </p>
                )}
                {money.outstandingCents > 0 && (
                  <p className="mt-1 text-[13px]" style={{ color: "var(--rose-ink)" }}>
                    {formatCents(money.outstandingCents)} billed and still on the street
                  </p>
                )}
              </div>
              <div className="text-right">
                <span
                  className="mono block text-[30px] font-bold leading-none"
                  style={{ color: marginTone(money.marginPct) }}
                >
                  {formatCents(money.marginCents)}
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
          )}
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
              const paidCents = inv.payments.reduce((s, p) => s + p.amountCents, 0);
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
                      {formatCents(inv.totalCents)}
                      {paidCents > 0 && paidCents < inv.totalCents && (
                        <span className="ml-2 text-[11px] text-ink-3">
                          paid {formatCents(paidCents)}
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
                  {/* What to ask for. Without it the man at the door phoned the office
                      for the figure on every visit — the role filter had taken the
                      balance out along with the margin. */}
                  {!ownerView && typeof project.dueAtDoorCents === "number" && (
                    <div className="col-span-2 border-l-2 border-line bg-sunk px-3 py-2">
                      <div className="eyebrow">Owing on this job</div>
                      <div className="mono mt-0.5 text-[19px] font-bold text-ink">
                        {formatCents(project.dueAtDoorCents)}
                      </div>
                      {project.dueAtDoorCents === 0 && (
                        <p className="mt-0.5 text-[12px] text-ink-2">
                          Nothing invoiced yet — take what the office told you to.
                        </p>
                      )}
                    </div>
                  )}
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
              <Empty>{ownerView ? "Nothing collected yet" : "Recorded straight to the owner's books"}</Empty>
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
                      {formatCents(p.amountCents)}
                    </span>
                  </div>
                ))}
                <div className="flex items-center justify-between px-1 py-2.5">
                  <span className="eyebrow">Total in</span>
                  <span className="mono text-[15px] font-bold" style={{ color: "var(--emerald-ink)" }}>
                    {formatCents(paidCents)}
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
              <Empty>{ownerView ? "No costs logged" : "Recorded straight to the owner's books"}</Empty>
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
                      {formatCents(e.amountCents)}
                    </span>
                  </div>
                ))}
                <div className="flex items-center justify-between px-1 py-2.5">
                  <span className="eyebrow">Total out</span>
                  <span className="mono text-[15px] font-bold" style={{ color: "var(--rose-ink)" }}>
                    {formatCents(expensesCents)}
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
