"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Plus, Search, X } from "lucide-react";
import { formatCents, inCents, type InCents } from "@/lib/money";
import { conflictsFor, formatDuration, spanDays } from "@/lib/schedule";
import {
  PageHead,
  LaneHead,
  Row,
  Ticket,
  WoNumber,
  Money,
  Empty,
  Plate,
  buttonClass,
  Skeleton,
  textToneFor,
} from "@/components/ui/primitives";
import { toast } from "@/components/ui/Toaster";

interface ClientOption {
  id: string;
  name: string;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  city?: string | null;
}

/** The payload as the API serves it: dollars. */
interface ApiProject {
  id: string;
  title: string;
  clientName: string;
  address: string;
  status: string;
  createdAt?: string;
  scheduledDate?: string | null;
  jobType?: string;
  /** Who drives there, and for how long — the board dispatches, so it needs both. */
  assignedToId?: string | null;
  assignedTo?: { id: string; name: string } | null;
  durationMinutes?: number | null;
  payments: { amount: number }[];
  estimates: { total: number; status: string }[];
  tasks: { id: string; status: string }[];
}

/** What this screen works in. */
type Project = InCents<ApiProject>;

const STATUSES = ["SCHEDULED", "IN_PROGRESS", "COMPLETED", "CANCELLED"];

/* ----------------------------------------------------------------------------
   THE STATE LADDER (DESIGN.md revision 3) — the Jobs device.
   A job's state changes its physical form: live orders sit on the desk as full
   ticket plates, booked orders hang on a date rail, closed orders compress into
   one-line drawer entries. Three lanes, three renderings, one toolbox.
   -------------------------------------------------------------------------- */

const paidCentsOf = (p: Project) => p.payments.reduce((s, x) => s + x.amountCents, 0);
const estCentsOf = (p: Project) => p.estimates[0]?.totalCents ?? null;

/** Everything a row needs to hand a job to somebody without opening it. */
interface Dispatch {
  crew: Array<{ id: string; name: string }>;
  assign: (project: Project, userId: string) => void;
  /** Jobs the same person already holds while this one runs. */
  clashesOn: (project: Project) => Project[];
}

/**
 * THE CREW PICKER — dispatch from the board.
 *
 * The board is where a dispatcher works the morning: opening every job card to hand it
 * to somebody is four taps per job, so the assignment lives on the row. It sits above
 * the row's stretched link, otherwise choosing a name would navigate away mid-choice.
 * Hidden entirely when the crew list is empty — the endpoint behind it is the owner's,
 * and a worker gets nothing back from it.
 */
function CrewPicker({ project, dispatch }: { project: Project; dispatch: Dispatch }) {
  if (!dispatch.crew.length) return null;
  const clashes = dispatch.clashesOn(project);
  const runs = spanDays(project);

  return (
    <span className="relative z-[1] flex shrink-0 items-center gap-2">
      {runs > 1 && (
        <span className="mono text-[10px] uppercase tracking-[0.08em] text-ink-3">
          {formatDuration(project.durationMinutes)}
        </span>
      )}
      {clashes.length > 0 && (
        <span
          className="mono text-[10px] uppercase tracking-[0.08em]"
          style={{ color: "var(--rose-ink)" }}
          title={`Also on ${clashes.map((c) => c.title).join(", ")} at this time`}
        >
          ! double
        </span>
      )}
      <select
        aria-label={`Crew on ${project.title}`}
        value={project.assignedToId ?? ""}
        onClick={(e) => e.stopPropagation()}
        onChange={(e) => dispatch.assign(project, e.target.value)}
        className="mono px-2 py-1 text-[11px] uppercase tracking-[0.06em]"
        style={clashes.length ? { borderColor: "var(--rose)" } : undefined}
      >
        <option value="">— UNCREWED —</option>
        {dispatch.crew.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>
    </span>
  );
}

/** Booked jobs group under a day-numeral rail cell, undated ones at the end. */
function groupByDate(jobs: Project[]) {
  const map = new Map<string, Project[]>();
  for (const p of jobs) {
    const key = p.scheduledDate ? p.scheduledDate.slice(0, 10) : "";
    map.set(key, [...(map.get(key) ?? []), p]);
  }
  return Array.from(map.entries())
    .sort(([a], [b]) => (a === "" ? 1 : b === "" ? -1 : a.localeCompare(b)))
    .map(([key, items]) => ({
      key: key || "undated",
      day: key ? String(parseInt(key.slice(8, 10), 10)) : "—",
      mon: key
        ? new Date(`${key}T00:00:00`)
            .toLocaleString("en-CA", { month: "short" })
            .toUpperCase()
        : "TBD",
      items,
    }));
}

/** ON THE GO — the full work order in your hand: crew tally + EST→PAID fill. */
function LiveTicket({ project, dispatch }: { project: Project; dispatch: Dispatch }) {
  const paidCents = paidCentsOf(project);
  const estCents = estCentsOf(project);
  const pct = estCents && estCents > 0 ? Math.min(paidCents / estCents, 1) * 100 : 0;
  const done = project.tasks.filter((t) => t.status === "DONE").length;
  return (
    <Ticket status={project.status} className="ticket-hover px-5 py-4">
      {/* Stretched link: the plate still opens the work order, while the crew select
          on it stays a real control — no <select> inside an <a>. */}
      <Link
        href={`/projects/${project.id}`}
        className="absolute inset-0"
        aria-label={`Open ${project.title}`}
      />
      <div className="flex items-baseline justify-between gap-3">
        <WoNumber id={project.id} date={project.createdAt} />
        <span className="flex items-center gap-3">
          {project.scheduledDate && (
            <span className="mono text-[11px] text-ink-3">
              {project.scheduledDate.slice(0, 10)}
            </span>
          )}
          <CrewPicker project={project} dispatch={dispatch} />
        </span>
      </div>
      <p className="mt-2 text-[17px] font-black leading-tight tracking-[-0.01em] text-ink">
        {project.title}
      </p>
      <p className="mt-1 truncate text-[13px] text-ink-2">
        {project.clientName} · {project.address}
      </p>
      {project.tasks.length > 0 && (
        <div className="mt-3 flex items-center gap-2">
          <span className="flex items-center gap-1">
            {project.tasks.slice(0, 10).map((t) => (
              <span
                key={t.id}
                className="inline-block h-2 w-2 rounded-full"
                style={
                  t.status === "DONE"
                    ? { background: "var(--emerald)" }
                    : { background: "var(--sunk)", border: "1px solid var(--line)" }
                }
              />
            ))}
          </span>
          <span className="mono text-[11px] text-ink-3">
            CREW {done}/{project.tasks.length}
          </span>
        </div>
      )}
      <div className="mt-3.5">
        <div className="h-1 bg-sunk">
          <div
            className="h-full transition-[width] duration-[380ms] ease-instrument"
            style={{ width: `${pct}%`, background: "var(--emerald)" }}
          />
        </div>
        <div className="mt-1.5 flex items-baseline gap-1.5">
          <span className="mono text-[11px] font-bold" style={{ color: "var(--emerald-ink)" }}>
            PAID {formatCents(paidCents)}
          </span>
          <span className="mono text-[11px] text-ink-3">
            / EST {estCents != null ? formatCents(estCents) : "—"}
          </span>
        </div>
      </div>
    </Ticket>
  );
}

/** BOOKED — a standard ruled row, hanging to the right of its date rail. */
function BookedRow({ project, dispatch }: { project: Project; dispatch: Dispatch }) {
  const estCents = estCentsOf(project);
  const done = project.tasks.filter((t) => t.status === "DONE").length;
  return (
    <Row status={project.status} className="row-hover">
      <Link
        href={`/projects/${project.id}`}
        className="absolute inset-0"
        aria-label={`Open ${project.title}`}
      />
      <div className="flex items-baseline justify-between gap-3">
        <div className="min-w-0">
          <WoNumber id={project.id} date={project.createdAt} />
          <p className="mt-1 truncate text-[15px] font-bold leading-tight text-ink">
            {project.title}
          </p>
          <p className="truncate text-[13px] text-ink-2">
            {project.clientName} · {project.address}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-4">
          <div className="text-right">
            {estCents != null && (
              <div className="mono text-[12px] text-ink-2">
                EST <Money cents={estCents} className="text-[13px]" />
              </div>
            )}
            {project.tasks.length > 0 && (
              <div className="mono mt-1 text-[11px] text-ink-3">
                CREW {done}/{project.tasks.length}
              </div>
            )}
          </div>
          <CrewPicker project={project} dispatch={dispatch} />
        </div>
      </div>
    </Row>
  );
}

/** CLOSED — the drawer: one compressed ledger line per order. */
function ClosedRow({ project }: { project: Project }) {
  const paidCents = paidCentsOf(project);
  const estCents = estCentsOf(project);
  const moneyCents = paidCents > 0 ? paidCents : estCents ?? 0;
  return (
    <Row href={`/projects/${project.id}`} status={project.status} className="!py-2">
      <div className="flex min-w-0 items-baseline gap-3 text-[13px]">
        <WoNumber id={project.id} date={project.createdAt} />
        <span className="truncate font-medium text-ink-2">{project.title}</span>
        <span className="hidden min-w-0 truncate text-ink-3 sm:inline">
          {project.clientName}
        </span>
        <span className="ml-auto flex shrink-0 items-baseline gap-3">
          <span
            className="mono text-[10px] uppercase tracking-[0.09em]"
            style={{ color: textToneFor(project.status) }}
          >
            {project.status.replace("_", " ")}
          </span>
          {moneyCents > 0 ? (
            <Money cents={moneyCents} className="text-[13px]" tone="var(--ink-3)" />
          ) : (
            <span className="mono text-[13px] text-ink-3">—</span>
          )}
        </span>
      </div>
    </Row>
  );
}

export default function ProjectsPage() {
  const searchParams = useSearchParams();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [showAddForm, setShowAddForm] = useState(false);
  const [clients, setClients] = useState<ClientOption[]>([]);
  /** The owner's crew list. A worker gets 401 here, and the pickers stay off his board. */
  const [crew, setCrew] = useState<Array<{ id: string; name: string }>>([]);
  const [form, setForm] = useState({
    clientId: "",
    clientName: "",
    phone: "",
    email: "",
    address: "",
    title: "",
    description: "",
    jobType: "",
    scheduledDate: "",
  });

  async function fetchProjects() {
    const params = new URLSearchParams();
    if (search) params.set("q", search);
    if (statusFilter) params.set("status", statusFilter);
    const res = await fetch(`/api/projects?${params}`);
    // The one door on this screen: dollars off the wire, cents on the board.
    const data = inCents((await res.json()) as ApiProject[]);
    setProjects(data);
    setLoading(false);
  }

  useEffect(() => {
    fetchProjects();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, statusFilter]);

  useEffect(() => {
    fetch("/api/settings/users")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setCrew(Array.isArray(d) ? d : []))
      .catch(() => null);
  }, []);

  /**
   * Dispatch from the board.
   *
   * The warning is computed against the jobs already on this screen and shown as a
   * confirm — a mover really does run two short jobs back to back, so the answer to a
   * collision is «are you sure», never «no». The server re-checks and answers with the
   * same list, which is what keeps two dispatchers on two phones honest.
   */
  const dispatch: Dispatch = {
    crew,
    clashesOn: (project) => conflictsFor(project, projects),
    assign: async (project, userId) => {
      const clashes = userId
        ? conflictsFor({ ...project, assignedToId: userId }, projects)
        : [];

      if (clashes.length) {
        const who = crew.find((c) => c.id === userId)?.name ?? "That tech";
        const list = clashes.map((c) => `· ${c.title} — ${c.clientName}`).join("\n");
        if (!confirm(`${who} is already booked at this time:\n\n${list}\n\nBook anyway?`)) {
          // Snap the select back to what is actually saved.
          setProjects((prev) => [...prev]);
          return;
        }
      }

      const res = await fetch(`/api/projects/${project.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...project, assignedToId: userId || null }),
      });

      /**
       * The server checked the whole workspace, this screen only checked what it is
       * currently showing: a status filter or a search hides the very job that collides.
       * Whatever the board missed comes back in the answer and is said out loud.
       */
      const saved = res.ok ? ((await res.json()) as { conflicts?: Array<{ title: string }> }) : null;
      const missed = (saved?.conflicts ?? []).length;
      toast(
        !userId
          ? "Assignment cleared"
          : missed && !clashes.length
            ? `Job assigned — also on ${saved!.conflicts!.map((c) => c.title).join(", ")} at this time`
            : "Job assigned"
      );
      fetchProjects();
    },
  };

  // Arriving from a client record: open the form with that client already chosen.
  const presetClient = searchParams.get("client");

  // The picker exists so a repeat customer is chosen, not retyped into a duplicate.
  useEffect(() => {
    if (!showAddForm && !presetClient) return;
    if (clients.length) return;
    fetch("/api/clients")
      .then((r) => r.json())
      .then((d) => setClients(Array.isArray(d) ? d : []))
      .catch(() => null);
  }, [showAddForm, presetClient, clients.length]);

  useEffect(() => {
    if (!presetClient || !clients.length || form.clientId) return;
    setShowAddForm(true);
    pickClient(presetClient);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [presetClient, clients.length]);

  function pickClient(id: string) {
    const c = clients.find((x) => x.id === id);
    if (!c) {
      setForm((f) => ({ ...f, clientId: "" }));
      return;
    }
    setForm((f) => ({
      ...f,
      clientId: c.id,
      clientName: c.name,
      phone: c.phone || "",
      email: c.email || "",
      address: c.address || f.address,
    }));
  }

  async function handleAddProject(e: React.FormEvent) {
    e.preventDefault();
    await fetch("/api/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    setShowAddForm(false);
    toast("Job opened");
    setForm({
      clientId: "",
      clientName: "",
      phone: "",
      email: "",
      address: "",
      title: "",
      description: "",
      jobType: "",
      scheduledDate: "",
    });
    fetchProjects();
  }

  const field = "w-full mt-1.5 px-3 py-2 text-[13px]";

  /* The ladder split. The server already narrows by statusFilter; the split
     just routes what came back into the right rung. */
  const live = projects.filter((p) => p.status === "IN_PROGRESS");
  const booked = projects.filter((p) => p.status === "SCHEDULED");
  const closed = projects.filter(
    (p) => p.status === "COMPLETED" || p.status === "CANCELLED"
  );
  const bookedGroups = groupByDate(booked);

  const showLive = !statusFilter || statusFilter === "IN_PROGRESS";
  const showBooked = !statusFilter || statusFilter === "SCHEDULED";
  const showClosed =
    !statusFilter || statusFilter === "COMPLETED" || statusFilter === "CANCELLED";
  const firstLane = showLive ? "live" : showBooked ? "booked" : "closed";

  /* Search + filter fold into the first lane head — no full-width bar. */
  const controls = (
    <div className="flex flex-wrap items-center justify-end gap-1.5">
      <div className="relative">
        <Search
          className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-3"
          strokeWidth={2}
        />
        <input
          placeholder="Search jobs…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-[140px] max-w-[240px] py-1.5 pl-7 pr-2 text-[12px] sm:w-[200px]"
        />
      </div>
      <select
        value={statusFilter}
        onChange={(e) => setStatusFilter(e.target.value)}
        className="mono px-2 py-1.5 text-[11px] uppercase tracking-[0.06em]"
      >
        <option value="">All</option>
        {STATUSES.map((s) => (
          <option key={s} value={s}>
            {s.replace("_", " ")}
          </option>
        ))}
      </select>
    </div>
  );

  return (
    <div className="space-y-8 pb-24 md:pb-0">
      <PageHead
        eyebrow="Work orders"
        title="Jobs"
        sub="Live orders on the desk, booked on the peg, closed in the drawer."
        action={
          <button onClick={() => setShowAddForm((v) => !v)} className={buttonClass("primary")}>
            {showAddForm ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
            {showAddForm ? "Close" : "New job"}
          </button>
        }
      />

      {showAddForm && (
        <Plate className="p-5">
          <div className="eyebrow">New work order</div>
          <div className="mt-4 border border-line bg-sunk px-3 py-2.5">
            <label className="eyebrow">Existing client</label>
            <select
              value={form.clientId}
              onChange={(e) => pickClient(e.target.value)}
              className="mt-1.5 w-full px-3 py-2 text-[13px]"
            >
              <option value="">— New client, type the details below —</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                  {c.address ? ` · ${c.address}` : ""}
                </option>
              ))}
            </select>
          </div>
          <form onSubmit={handleAddProject} className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
            {[
              { label: "Client name *", key: "clientName", type: "text", required: true },
              { label: "Phone", key: "phone", type: "tel" },
              { label: "Email", key: "email", type: "email" },
              { label: "Job type", key: "jobType", type: "text" },
              { label: "Scheduled date", key: "scheduledDate", type: "date" },
            ].map(({ label, key, type, required }) => (
              <div key={key}>
                <label className="eyebrow">{label}</label>
                <input
                  required={required}
                  type={type}
                  value={(form as Record<string, string>)[key] || ""}
                  onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                  className={key === "phone" || key === "scheduledDate" ? `${field} mono` : field}
                />
              </div>
            ))}
            <div className="sm:col-span-2">
              <label className="eyebrow">Job title *</label>
              <input
                required
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                className={field}
              />
            </div>
            <div className="sm:col-span-2">
              <label className="eyebrow">Address *</label>
              <input
                required
                value={form.address}
                onChange={(e) => setForm({ ...form, address: e.target.value })}
                className={field}
              />
            </div>
            <div className="sm:col-span-2">
              <label className="eyebrow">Description</label>
              <textarea
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                rows={2}
                className={field}
              />
            </div>
            <div className="flex gap-2 sm:col-span-2">
              <button type="submit" className={buttonClass("primary")}>
                Open job
              </button>
              <button
                type="button"
                onClick={() => setShowAddForm(false)}
                className={buttonClass("ghost")}
              >
                Cancel
              </button>
            </div>
          </form>
        </Plate>
      )}

      {loading ? (
        <section>
          <LaneHead title="ON THE GO" lamp="var(--amber)" right={controls} />
          <Skeleton lines={4} />
        </section>
      ) : (
        <>
          {/* RUNG 1 — ON THE GO: each live job is a full work-order plate. */}
          {showLive && (
            <section>
              <LaneHead
                title={`ON THE GO · ${live.length}`}
                lamp="var(--amber)"
                right={firstLane === "live" ? controls : undefined}
              />
              {live.length === 0 ? (
                <Empty>Nothing on the desk — no jobs running</Empty>
              ) : (
                <div className="flex flex-col gap-3">
                  {live.map((p) => (
                    <LiveTicket key={p.id} project={p} dispatch={dispatch} />
                  ))}
                </div>
              )}
            </section>
          )}

          {/* RUNG 2 — BOOKED: rows hung on a date rail, board-style numerals. */}
          {showBooked && (
            <section>
              <LaneHead
                title={`BOOKED · ${booked.length}`}
                lamp="var(--sky)"
                right={firstLane === "booked" ? controls : undefined}
              />
              {booked.length === 0 ? (
                <Empty>Nothing on the peg — no work booked</Empty>
              ) : (
                <div className="border-t border-line">
                  {bookedGroups.map((g) => (
                    <div
                      key={g.key}
                      className="grid grid-cols-[48px_1fr] border-b border-line last:border-b-0 sm:grid-cols-[64px_1fr]"
                    >
                      <div className="border-r border-line pr-2 pt-4">
                        <div className="mono text-[22px] font-medium leading-none text-ink">
                          {g.day}
                        </div>
                        <div className="eyebrow mt-1.5">{g.mon}</div>
                      </div>
                      <div>
                        {g.items.map((p) => (
                          <BookedRow key={p.id} project={p} dispatch={dispatch} />
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          )}

          {/* RUNG 3 — CLOSED: the drawer, one compressed ledger line each. */}
          {showClosed && (
            <section>
              <LaneHead
                title={`CLOSED · ${closed.length}`}
                lamp="var(--emerald)"
                right={firstLane === "closed" ? controls : undefined}
              />
              {closed.length === 0 ? (
                <Empty>The drawer is empty — no closed orders</Empty>
              ) : (
                <div className="border-t border-line">
                  {closed.map((p) => (
                    <ClosedRow key={p.id} project={p} />
                  ))}
                </div>
              )}
            </section>
          )}
        </>
      )}
    </div>
  );
}
