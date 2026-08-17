"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Plus, FileText, Scissors, Phone, Navigation, Mail } from "lucide-react";
import { cn } from "@/lib/utils";
import { dayStamp } from "@/lib/dates";
import { dollarText, formatCents, inCents, type InCents } from "@/lib/money";
import {
  Empty,
  buttonClass,
  textToneFor,
  Plate,
  Ticket,
  Skeleton,
  LaneHead,
  BackLink,
  WoNumber,
  Money,
  Num,
  Stamp,
  Readout,
  Row,
  Chip,
  Field,
  Lane,
  MeterBar,
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

/** The clock half of a booking: `09:00–12:00`, `3 days`, or nothing agreed yet. */
function clockLabel(job: { scheduledDate: string | null; durationMinutes?: number | null }) {
  if (!job.scheduledDate) return "";
  const d = new Date(job.scheduledDate);
  const runs = spanDays(job as ScheduleJob);
  const timed = d.getHours() !== 0 || d.getMinutes() !== 0;
  if (runs > 1) return `${timed ? `${clockOf(d)} · ` : ""}${runs} days`;
  if (!timed) return "anytime";
  const end = new Date(d.getTime() + (job.durationMinutes ?? DEFAULT_SLOT_MINUTES) * 60_000);
  return `${clockOf(d)}–${clockOf(end)}`;
}

const TABS = ["overview", "invoices", "tasks", "money"] as const;
type Tab = (typeof TABS)[number];

/** What the crew gets: the work and the day's cash, without the books behind them. */
const FIELD_TABS: Tab[] = ["overview", "tasks", "money"];

export default function ProjectDetailPage({ params }: { params: { id: string } }) {
  const [project, setProject] = useState<Project | null>(null);
  const [tab, setTab] = useState<Tab>("overview");
  /* E-transfer first: it is how an Ontario contractor is paid at the door far more often
     than cash, and the default is the value most techs never change. */
  const [paymentForm, setPaymentForm] = useState({ amount: "", method: "E_TRANSFER", notes: "", date: "" });
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
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({});

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

  /**
   * Money is the one form that must never say «recorded» on a guess. The tech on the
   * step reads the tick, puts the phone away and drives off; if the server refused —
   * a bad amount, a dead session, no signal — nothing was written and nobody knows.
   */
  async function handleAddPayment(e: React.FormEvent) {
    e.preventDefault();
    const res = await fetch("/api/finance/payments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...paymentForm, projectId: params.id }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      toast(body.error || "The payment was not recorded — try it again", "bad");
      return;
    }
    setPaymentForm({ amount: "", method: "E_TRANSFER", notes: "", date: "" });
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

  if (!project)
    return (
      <div className="page-doc space-y-6 pb-24 md:pb-0">
        <BackLink href="/projects" label="All jobs" />
        <Skeleton lines={5} />
      </div>
    );

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
  const clock = clockLabel({
    scheduledDate: project.scheduledDate ?? null,
    durationMinutes: project.durationMinutes ?? null,
  });

  /** Tabs are a keyboard instrument too: ← → walk them, Home/End jump the ends. */
  function onTabKey(e: React.KeyboardEvent, index: number) {
    const step =
      e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : e.key === "Home" ? -index : e.key === "End" ? tabs.length - 1 - index : null;
    if (step === null) return;
    e.preventDefault();
    const next = tabs[(index + step + tabs.length) % tabs.length];
    setTab(next);
    tabRefs.current[next]?.focus();
  }

  const primaryAction =
    project.status === "SCHEDULED" ? (
      <button onClick={() => handleStatusChange("IN_PROGRESS")} className={buttonClass("primary")}>
        Start job
      </button>
    ) : project.status === "IN_PROGRESS" ? (
      <button onClick={() => handleStatusChange("COMPLETED")} className={buttonClass("primary")}>
        Mark complete
      </button>
    ) : null;

  const paperActions = ownerView ? (
    <>
      <Link href={`/projects/${project.id}/estimate`} className={buttonClass("ghost")}>
        <FileText className="hidden h-4 w-4 md:inline-block" aria-hidden />
        {project.estimates.length > 0 ? "Estimates" : "Create estimate"}
      </Link>
      {acceptedEstimate && (
        <Link href={`/projects/${project.id}/estimate`} className={buttonClass("ghost")}>
          <Scissors className="hidden h-4 w-4 md:inline-block" aria-hidden /> Issue invoice
        </Link>
      )}
    </>
  ) : null;

  return (
    <div className="page-doc space-y-6 pb-24 md:pb-0">
      <BackLink href="/projects" label="All jobs" />

      {/* The record header IS the work-order plate: number, title, who it is for,
          and the three things a hand can act on. */}
      <Ticket status={project.status} className="px-5 py-5">
        <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
          <div className="min-w-0">
            <WoNumber id={project.id} date={project.createdAt} />
            <h1 className="t-record mt-1.5 font-black tracking-tight text-ink">
              {project.title}
            </h1>
            <p className="t-lede mt-2 text-ink-2">
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
          <span className="eyebrow shrink-0" style={{ color: textToneFor(project.status) }}>
            {project.status.replace("_", " ")}
          </span>
        </div>

        {/* The three field targets, in the same words the truck screen uses. Printed
            as text they were 17px of dead ink: the man in the driveway had a phone
            number he could read and could not dial. */}
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
          {project.phone && (
            <a href={`tel:${project.phone}`} className="eyebrow inline-flex items-center gap-1.5 hover:text-ink">
              <Phone className="h-3.5 w-3.5" aria-hidden /> CALL {project.phone}
            </a>
          )}
          <a
            href={`https://maps.google.com/?q=${encodeURIComponent(project.address)}`}
            target="_blank"
            rel="noopener"
            className="eyebrow inline-flex items-center gap-1.5 hover:text-ink"
          >
            <Navigation className="h-3.5 w-3.5" aria-hidden /> DRIVE
          </a>
          {project.email && (
            <a href={`mailto:${project.email}`} className="eyebrow inline-flex items-center gap-1.5 hover:text-ink">
              <Mail className="h-3.5 w-3.5" aria-hidden /> EMAIL
            </a>
          )}
        </div>

        {/* The crew reads the booking here, because the dispatch strip below is the
            owner's. Without it his card said nothing about when he is expected.
            Each fact is its own span, so a narrow screen breaks between them and
            never through the middle of a man's name. */}
        {!ownerView && (
          <div className="mt-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
            {project.scheduledDate ? (
              <span className="eyebrow">
                <Stamp date={project.scheduledDate} />
                {clock && ` · ${clock}`}
              </span>
            ) : (
              <span className="eyebrow" style={{ color: "var(--amber-ink)" }}>
                NO DAY BOOKED
              </span>
            )}
            {project.assignedTo && (
              <span className="eyebrow">CREW · {project.assignedTo.name}</span>
            )}
          </div>
        )}

        {/* What kind of work this is, on the plate where the trade reads it. */}
        {(project.jobType || project.lead) && (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {project.jobType && <Chip>{project.jobType}</Chip>}
            {project.lead && (
              <Chip title={`Came off the lead ${project.lead.name}`}>
                FROM LEAD · {project.lead.source.replace(/_/g, " ")}
              </Chip>
            )}
          </div>
        )}

        {/* No actions, no rule. A finished job on a worker's card used to draw an
            empty band across the plate with nothing in it. The one action that moves
            the job forward keeps its own line, so it is the full width of a phone
            instead of half a line with its label broken in two. */}
        {primaryAction && (
          <div className="actions mt-5 border-t border-line pt-4">{primaryAction}</div>
        )}
        {paperActions && (
          <div className={cn("actions", primaryAction ? "mt-2" : "mt-5 border-t border-line pt-4")}>
            {paperActions}
          </div>
        )}

        {/* THE DISPATCH STRIP — when it runs, how long it runs, who runs it.
            Dispatch is the owner's call: the crew select used to sit here for the field
            too, empty, and one tap on «— Unassigned —» took the tech off his own work
            order. The date lived in the read-only list below, so a job could not be moved
            at all once it was opened. */}
        {ownerView && (
          /* Two columns of equal width on a phone, four boxes at their own widths on
             the desk. Fixed widths alone left a ragged 390px stack: a 152px date, a
             116px clock and a 176px name each on their own line. */
          <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 border-t border-line pt-4 sm:flex sm:flex-wrap sm:items-end sm:gap-x-5">
            <Field id="job-day" label="Day" className="sm:w-[152px]">
              {(f) => (
                <input
                  {...f}
                  type="date"
                  className={`${f.className} mono`}
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
                />
              )}
            </Field>

            <Field id="job-start" label="Start" className="sm:w-[116px]">
              {(f) => (
                <input
                  {...f}
                  type="time"
                  className={`${f.className} mono`}
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
                />
              )}
            </Field>

            {/* Two trades, one ruler: a mover books hours of this day, a renovation
                books days, and the week rail draws whatever comes out as one run. */}
            <Field id="job-takes" label="Takes" className="sm:w-[148px]">
              {(f) => (
                <select
                  {...f}
                  className={`${f.className} mono uppercase tracking-[0.06em]`}
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
                >
                  <option value="">— One stop —</option>
                  {DURATION_CHOICES.map((d) => (
                    <option key={d.minutes} value={d.minutes}>
                      {d.label}
                    </option>
                  ))}
                </select>
              )}
            </Field>

            <Field id="job-crew" label="Crew" className="sm:ml-auto sm:w-[176px]">
              {(f) => (
                <select
                  {...f}
                  className={`${f.className} mono uppercase tracking-[0.06em]`}
                  value={pending?.userId ?? project.assignedToId ?? ""}
                  onChange={(e) => assignTo(e.target.value)}
                >
                  <option value="">— Unassigned —</option>
                  {crew.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              )}
            </Field>
          </div>
        )}

        {/* DOUBLE BOOKING — the warning is a report with a way forward, never a refusal.
            Two short moving jobs on one man in one afternoon is a normal Saturday. */}
        {ownerView && pending && (
          <div
            className="mt-4 border-t pt-4"
            style={{ borderTopColor: "var(--rose)" }}
            role="alert"
          >
            <div className="eyebrow" style={{ color: "var(--rose-ink)" }}>
              Double booking
            </div>
            <p className="t-body mt-1.5 text-ink">
              {crew.find((c) => c.id === pending.userId)?.name ?? "That tech"} is already on{" "}
              <Num>{pending.clashes.length}</Num> job
              {pending.clashes.length === 1 ? "" : "s"} at the same time:
            </p>
            <ul className="mt-2 space-y-1">
              {pending.clashes.map((c) => (
                <li key={c.id} className="t-body text-ink-2">
                  <Link
                    href={`/projects/${c.id}`}
                    className="font-medium text-ink underline underline-offset-4"
                  >
                    {c.title}
                  </Link>{" "}
                  · {c.clientName} ·{" "}
                  <span className="mono t-meta">
                    {c.scheduledDate ? (
                      <>
                        <Stamp date={c.scheduledDate} />
                        {clockLabel(c) && ` · ${clockLabel(c)}`}
                      </>
                    ) : (
                      "unscheduled"
                    )}
                  </span>
                </li>
              ))}
            </ul>
            <div className="actions mt-3">
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
            className="eyebrow mt-3 border-t border-line pt-3"
            style={{ color: "var(--rose-ink)" }}
          >
            ! {project.assignedTo?.name ?? "This tech"} also holds{" "}
            {standingClashes.map((c) => c.title).join(" · ")} at this time
          </p>
        )}
      </Ticket>

      {/* Tabs — ruled, not pills, and driven by the keyboard like a real tablist. */}
      <div className="flex gap-6 border-b border-line" role="tablist" aria-label="Job sections">
        {tabs.map((t, i) => (
          <button
            key={t}
            id={`tab-${t}`}
            ref={(el) => {
              tabRefs.current[t] = el;
            }}
            role="tab"
            aria-selected={tab === t}
            aria-controls={`panel-${t}`}
            tabIndex={tab === t ? 0 : -1}
            onKeyDown={(e) => onTabKey(e, i)}
            onClick={() => setTab(t)}
            className={cn(
              "t-meta -mb-px border-b-2 pb-2.5 font-bold uppercase tracking-[0.08em] transition-colors duration-fast ease-instrument",
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
        <div className="space-y-6" role="tabpanel" id="panel-overview" aria-labelledby="tab-overview">
          <AddressHistory projectId={params.id} />

          {project.description && (
            <section>
              <LaneHead title="What the work is" />
              <p className="measure t-body border-t border-line pt-4 text-ink-2">
                {project.description}
              </p>
            </section>
          )}

          <JobPhotos projectId={params.id} />

          {/* Did this job make money — the four numbers, then the verdict. */}
          {ownerView && (
            <section>
              <LaneHead title="Did this job make money" />
              <div className="grid grid-cols-2 gap-x-8 gap-y-6 border-t border-line pt-5 md:grid-cols-4">
                {[
                  { label: "Quoted", value: formatCents(money.quotedCents) },
                  { label: "Invoiced", value: formatCents(money.invoicedCents) },
                  {
                    label: "Collected",
                    value: formatCents(money.collectedCents),
                    tone: money.collectedCents > 0 ? "var(--emerald-ink)" : undefined,
                  },
                  {
                    label: "Costs",
                    value: formatCents(money.costsCents),
                    tone: money.costsCents > 0 ? "var(--rose-ink)" : undefined,
                  },
                ].map((r) => (
                  <div key={r.label}>
                    <div className="eyebrow">{r.label}</div>
                    <Readout value={r.value} size={22} tone={r.tone} className="mt-1.5 block" />
                  </div>
                ))}
              </div>

              {/* The margin as one bar: what came in against what it cost to do.
                  Collected in emerald, costs in rose — the sliver of plate showing
                  past the costs is the margin, read by shape before the figure. */}
              {(money.collectedCents > 0 || money.costsCents > 0) && (
                <div className="mt-6">
                  <MeterBar
                    height={10}
                    segments={[
                      { value: money.collectedCents, tone: "var(--emerald)", label: "Collected" },
                      { value: money.costsCents, tone: "var(--rose)", label: "Costs" },
                    ]}
                    ariaLabel="Collected against costs"
                  />
                  <div className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1.5">
                    <span className="inline-flex items-center gap-1.5">
                      <span aria-hidden className="inline-block h-2 w-2 shrink-0" style={{ background: "var(--emerald)" }} />
                      <span className="eyebrow">Collected</span>
                      <Money cents={money.collectedCents} className="t-meta text-ink-2" />
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <span aria-hidden className="inline-block h-2 w-2 shrink-0" style={{ background: "var(--rose)" }} />
                      <span className="eyebrow">Costs</span>
                      <Money cents={money.costsCents} className="t-meta text-ink-2" />
                    </span>
                  </div>
                </div>
              )}

              <div className="mt-6 flex flex-wrap items-end justify-between gap-4 border-t border-line pt-5">
                <div>
                  <div className="eyebrow">Margin — collected minus costs</div>
                  <p className="measure t-body mt-1 text-ink-2">{marginVerdict(money)}</p>
                  {money.unbilledCents > 0 && (
                    <p className="t-body mt-1" style={{ color: "var(--amber-ink)" }}>
                      <Money cents={money.unbilledCents} /> quoted and never invoiced
                    </p>
                  )}
                  {money.outstandingCents > 0 && (
                    <p className="t-body mt-1" style={{ color: "var(--rose-ink)" }}>
                      <Money cents={money.outstandingCents} /> billed and still on the street
                    </p>
                  )}
                </div>
                <div className="text-right">
                  <Readout
                    value={formatCents(money.marginCents)}
                    tone={marginTone(money.marginPct)}
                    className="block"
                  />
                  {money.marginPct !== null && (
                    <span
                      className="mono t-body mt-1 block"
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
        <div className="space-y-2.5" role="tabpanel" id="panel-invoices" aria-labelledby="tab-invoices">
          {invoices.length === 0 ? (
            <Empty
              hint={
                acceptedEstimate
                  ? "The accepted estimate tears off into an invoice with the same lines."
                  : "An estimate the client accepts becomes the invoice — no retyping."
              }
              action={
                <Link href={`/projects/${project.id}/estimate`} className={buttonClass("ghost")}>
                  {acceptedEstimate ? "Issue invoice" : "Go to estimates"}
                </Link>
              }
            >
              No invoices on this job
            </Empty>
          ) : (
            invoices.map((inv) => {
              const invPaidCents = inv.payments.reduce((s, p) => s + p.amountCents, 0);
              return (
                <Ticket key={inv.id} href={`/invoices/${inv.id}`} status={inv.status}>
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="mono eyebrow font-bold text-ink-2">{inv.number}</span>
                    <span className="eyebrow" style={{ color: textToneFor(inv.status) }}>
                      {inv.status}
                    </span>
                  </div>
                  <div className="mt-1.5 flex items-baseline justify-between gap-3">
                    <span className="t-body text-ink-2">
                      {inv.dueDate ? (
                        <>
                          Due <Stamp date={inv.dueDate} />
                        </>
                      ) : (
                        "No due date"
                      )}
                    </span>
                    <span className="text-ink">
                      <Money cents={inv.totalCents} className="t-row font-medium" />
                      {invPaidCents > 0 && invPaidCents < inv.totalCents && (
                        <span className="eyebrow ml-2">
                          PAID <Money cents={invPaidCents} />
                        </span>
                      )}
                    </span>
                  </div>
                </Ticket>
              );
            })
          )}
        </div>
      )}

      {tab === "tasks" && (
        <div role="tabpanel" id="panel-tasks" aria-labelledby="tab-tasks">
          {project.tasks.length === 0 ? (
            <Empty
              hint="Tasks are the steps the crew ticks off on the board — add them there and they show up here."
              action={
                <Link href="/tasks" className={buttonClass("ghost")}>
                  Open the crew board
                </Link>
              }
            >
              No crew tasks on this job
            </Empty>
          ) : (
            <Lane>
              {project.tasks.map((task) => (
                <Row key={task.id} status={task.status}>
                  <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
                    <div className="min-w-0">
                      <p className="t-row font-bold text-ink">{task.title}</p>
                      <p className="t-meta text-ink-2">
                        {task.assignedTo.name}
                        {task.dueDate && (
                          <>
                            {" · due "}
                            <Stamp date={task.dueDate} className="t-meta" />
                          </>
                        )}
                      </p>
                    </div>
                    <div className="shrink-0">
                      <label className="sr-only" htmlFor={`task-state-${task.id}`}>
                        State of {task.title}
                      </label>
                      <select
                        id={`task-state-${task.id}`}
                        value={task.status}
                        onChange={(e) => handleTaskStatusChange(task.id, e.target.value)}
                        className="mono t-micro px-2 py-1 uppercase leading-[16px] tracking-[0.06em]"
                      >
                        <option value="TODO">QUEUED</option>
                        <option value="IN_PROGRESS">ON THE TRUCK</option>
                        <option value="DONE">CLOSED</option>
                      </select>
                    </div>
                  </div>
                </Row>
              ))}
            </Lane>
          )}
        </div>
      )}

      {tab === "money" && (
        <div className="space-y-10" role="tabpanel" id="panel-money" aria-labelledby="tab-money">
          {/* What to ask for at the door. Without it the man on the step phoned the
              office for the figure on every visit — the role filter had taken the
              balance out along with the margin. */}
          {!ownerView && typeof project.dueAtDoorCents === "number" && (
            <section>
              <LaneHead title="Owing on this job" />
              <div className="border-t border-line pt-4">
                <Readout value={formatCents(project.dueAtDoorCents)} className="block" />
                <p className="measure t-body mt-2 text-ink-2">
                  {/* Zero says two different things, and the man at the door has to be
                      told which one. Paid up reads as «walk away»; nothing billed yet
                      reads as «ask the office». One sentence covered both and sent him
                      back for money he had already taken. */}
                  {project.dueAtDoorCents === 0
                    ? paidCents > 0
                      ? "Paid up — this job owes nothing at the door. The office closes the paper."
                      : "Nothing invoiced yet — take what the office told you to."
                    : "That is the balance on the paper the office sent. Cash, cheque and e-transfer all land in the same book."}
                </p>
              </div>
            </section>
          )}

          <section>
            <LaneHead
              title="Payments in"
              right={
                <button
                  onClick={() => {
                    /* The amount is on the screen above the button. Making the man in
                       the doorway retype it, glove on, is how $519.80 becomes $51.98. */
                    if (!showPaymentForm && !paymentForm.amount && project.dueAtDoorCents) {
                      setPaymentForm((f) => ({ ...f, amount: dollarText(project.dueAtDoorCents ?? 0) }));
                    }
                    setShowPaymentForm(!showPaymentForm);
                  }}
                  className={buttonClass("ghost")}
                >
                  <Plus className="h-3.5 w-3.5" /> Payment
                </button>
              }
            />

            {showPaymentForm && (
              <Plate className="mb-4 p-4">
                <form
                  onSubmit={handleAddPayment}
                  className="grid grid-cols-2 gap-4 sm:flex sm:flex-wrap sm:items-end"
                >
                  <Field id="pay-amount" label="Amount" required className="sm:w-[148px]">
                    {(f) => (
                      <input
                        {...f}
                        type="number"
                        step="0.01"
                        className={`${f.className} mono`}
                        value={paymentForm.amount}
                        onChange={(e) => setPaymentForm({ ...paymentForm, amount: e.target.value })}
                      />
                    )}
                  </Field>
                  <Field id="pay-method" label="Method" className="sm:w-[168px]">
                    {(f) => (
                      <select
                        {...f}
                        className={`${f.className} mono uppercase tracking-[0.06em]`}
                        value={paymentForm.method}
                        onChange={(e) => setPaymentForm({ ...paymentForm, method: e.target.value })}
                      >
                        {["E_TRANSFER", "CASH", "CHEQUE", "CARD"].map((m) => (
                          <option key={m} value={m}>
                            {m.replace("_", "-")}
                          </option>
                        ))}
                      </select>
                    )}
                  </Field>
                  <Field id="pay-date" label="Date" className="sm:w-[164px]">
                    {(f) => (
                      <input
                        {...f}
                        type="date"
                        className={`${f.className} mono`}
                        value={paymentForm.date}
                        onChange={(e) => setPaymentForm({ ...paymentForm, date: e.target.value })}
                      />
                    )}
                  </Field>
                  <Field id="pay-notes" label="Notes" className="col-span-2 sm:col-span-1 sm:min-w-[200px] sm:flex-1">
                    {(f) => (
                      <input
                        {...f}
                        value={paymentForm.notes}
                        onChange={(e) => setPaymentForm({ ...paymentForm, notes: e.target.value })}
                      />
                    )}
                  </Field>
                  <div className="actions col-span-2 sm:w-full">
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
              <Empty hint="Money against this job lands here — from the door, from the bank, from the invoice.">
                Nothing collected yet
              </Empty>
            ) : (
              <div className="border-t border-line">
                {project.payments.map((p) => (
                  <div
                    key={p.id}
                    className="flex items-baseline justify-between gap-4 border-b border-line px-1 py-2.5"
                  >
                    <span className="mono t-meta text-ink-3">
                      <Stamp date={p.date} className="t-meta" /> · {p.method.replace("_", "-")}
                      {p.notes ? ` · ${p.notes}` : ""}
                    </span>
                    <Money
                      cents={p.amountCents}
                      className="t-body font-medium"
                      tone="var(--emerald-ink)"
                    />
                  </div>
                ))}
                <div className="flex items-baseline justify-between gap-4 px-1 py-2.5">
                  <span className="eyebrow">Total in</span>
                  <Money
                    cents={paidCents}
                    className="t-row font-bold"
                    tone="var(--emerald-ink)"
                  />
                </div>
              </div>
            )}
          </section>

          <section>
            <LaneHead
              title="Costs out"
              right={
                <button
                  onClick={() => setShowExpenseForm(!showExpenseForm)}
                  className={buttonClass("ghost")}
                >
                  <Plus className="h-3.5 w-3.5" /> Expense
                </button>
              }
            />

            {showExpenseForm && (
              <Plate className="mb-4 p-4">
                <form
                  onSubmit={handleAddExpense}
                  className="grid grid-cols-2 gap-4 sm:flex sm:flex-wrap sm:items-end"
                >
                  <Field id="cost-amount" label="Amount" required className="sm:w-[148px]">
                    {(f) => (
                      <input
                        {...f}
                        type="number"
                        step="0.01"
                        className={`${f.className} mono`}
                        value={expenseForm.amount}
                        onChange={(e) => setExpenseForm({ ...expenseForm, amount: e.target.value })}
                      />
                    )}
                  </Field>
                  <Field id="cost-category" label="Category" className="sm:w-[168px]">
                    {(f) => (
                      <select
                        {...f}
                        className={`${f.className} mono uppercase tracking-[0.06em]`}
                        value={expenseForm.category}
                        onChange={(e) =>
                          setExpenseForm({ ...expenseForm, category: e.target.value })
                        }
                      >
                        {["MATERIALS", "LABOR", "TOOLS", "VEHICLE", "OTHER"].map((c) => (
                          <option key={c} value={c}>
                            {c}
                          </option>
                        ))}
                      </select>
                    )}
                  </Field>
                  <Field id="cost-date" label="Date" className="sm:w-[164px]">
                    {(f) => (
                      <input
                        {...f}
                        type="date"
                        className={`${f.className} mono`}
                        value={expenseForm.date}
                        onChange={(e) => setExpenseForm({ ...expenseForm, date: e.target.value })}
                      />
                    )}
                  </Field>
                  <Field id="cost-description" label="What it was" className="col-span-2 sm:col-span-1 sm:min-w-[200px] sm:flex-1">
                    {(f) => (
                      <input
                        {...f}
                        value={expenseForm.description}
                        onChange={(e) =>
                          setExpenseForm({ ...expenseForm, description: e.target.value })
                        }
                      />
                    )}
                  </Field>
                  <div className="actions col-span-2 sm:w-full">
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
              <Empty
                hint={
                  ownerView
                    ? "Materials, dump runs and hired hands go here — margin is collected minus this."
                    : "Receipts you log against the job go straight to the owner's books."
                }
              >
                {ownerView ? "No costs logged" : "Nothing logged on this job yet"}
              </Empty>
            ) : (
              <div className="border-t border-line">
                {project.expenses.map((e) => (
                  <div
                    key={e.id}
                    className="flex items-baseline justify-between gap-4 border-b border-line px-1 py-2.5"
                  >
                    <span className="mono t-meta text-ink-3">
                      <Stamp date={e.date} className="t-meta" /> · {e.category}
                      {e.description ? ` · ${e.description}` : ""}
                    </span>
                    <Money
                      cents={e.amountCents}
                      className="t-body font-medium"
                      tone="var(--rose-ink)"
                    />
                  </div>
                ))}
                <div className="flex items-baseline justify-between gap-4 px-1 py-2.5">
                  <span className="eyebrow">Total out</span>
                  <Money cents={expensesCents} className="t-row font-bold" tone="var(--rose-ink)" />
                </div>
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
