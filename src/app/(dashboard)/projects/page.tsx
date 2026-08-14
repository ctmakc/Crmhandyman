"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Plus, Search, X } from "lucide-react";
import { inCents, type InCents } from "@/lib/money";
import { conflictsFor, formatDuration, spanDays } from "@/lib/schedule";
import {
  PageHead,
  LaneHead,
  Row,
  Ticket,
  WoNumber,
  Money,
  Num,
  Stamp,
  Empty,
  Field,
  Plate,
  buttonClass,
  controlClass,
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
  /** Sent by the API to the crew: their board is served with the money stripped out. */
  viewerRole?: "ADMIN" | "WORKER";
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
  const id = `crew-${project.id}`;

  return (
    <span className="relative z-[1] flex shrink-0 items-center gap-2">
      {clashes.length > 0 && (
        <span
          className="eyebrow"
          style={{ color: "var(--rose-ink)" }}
          title={`Also on ${clashes.map((c) => c.title).join(", ")} at this time`}
        >
          ! double
        </span>
      )}
      <label className="sr-only" htmlFor={id}>
        Crew on {project.title}
      </label>
      <select
        id={id}
        value={project.assignedToId ?? ""}
        onClick={(e) => e.stopPropagation()}
        onChange={(e) => dispatch.assign(project, e.target.value)}
        /* Row scale, the same box as a `quiet` button: 26px on the desk, 44 on the
           phone from the field rule. A full `.control` here would be a 38px slab
           inside a 15px line of type. */
        className="mono t-micro px-2 py-1 uppercase leading-[16px] tracking-[0.06em]"
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

/**
 * WHEN · WHO — the two facts a row is opened to find, in one mono line.
 * A worker's board carries no picker, so his row prints the name instead of an
 * empty control; an unassigned job says so in amber, because a truck with nobody
 * on it does not leave the yard.
 */
function WhenWho({
  project,
  dispatch,
  showPicker,
}: {
  project: Project;
  dispatch: Dispatch;
  showPicker: boolean;
}) {
  const runs = spanDays(project);
  const done = project.tasks.filter((t) => t.status === "DONE").length;
  return (
    <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
      <span className="eyebrow">
        {project.scheduledDate ? (
          <Stamp date={project.scheduledDate} />
        ) : (
          <span style={{ color: "var(--amber-ink)" }}>NO DAY BOOKED</span>
        )}
        {runs > 1 && ` · ${formatDuration(project.durationMinutes)}`}
      </span>

      {project.tasks.length > 0 && (
        <span className="flex items-center gap-2">
          <span className="flex items-center gap-1" aria-hidden>
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
          <span className="eyebrow">
            TASKS <Num>{done}</Num>/<Num>{project.tasks.length}</Num>
          </span>
        </span>
      )}

      <span className="ml-auto">
        {showPicker ? (
          <CrewPicker project={project} dispatch={dispatch} />
        ) : project.assignedTo ? (
          <span className="eyebrow">CREW · {project.assignedTo.name}</span>
        ) : (
          <span className="eyebrow" style={{ color: "var(--amber-ink)" }}>
            UNCREWED
          </span>
        )}
      </span>
    </div>
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

/** ON THE GO — the full work order in your hand: when, where, who, EST→PAID fill. */
function LiveTicket({
  project,
  dispatch,
  ownerView,
}: {
  project: Project;
  dispatch: Dispatch;
  ownerView: boolean;
}) {
  const paidCents = paidCentsOf(project);
  const estCents = estCentsOf(project);
  const pct = estCents && estCents > 0 ? Math.min(paidCents / estCents, 1) * 100 : 0;
  return (
    <Ticket status={project.status} className="ticket-hover px-5 py-4">
      {/* Stretched link: the plate still opens the work order, while the crew select
          on it stays a real control — no <select> inside an <a>. */}
      <Link
        href={`/projects/${project.id}`}
        className="absolute inset-0"
        aria-label={`Open ${project.title}`}
      />
      {/* The plate number never breaks: at 390px it was folding into
          «WO-2026-» / «MHJP» to make room for the date beside it. The status word
          used to sit opposite it and said IN PROGRESS on every plate of a lane
          called ON THE GO, under an amber lamp, beside an amber spine. */}
      <span className="whitespace-nowrap">
        <WoNumber id={project.id} date={project.createdAt} />
      </span>
      <p className="t-record mt-2 font-black tracking-[-0.01em] text-ink">{project.title}</p>
      <p className="t-body mt-1 truncate text-ink-2">
        {project.clientName} · {project.address}
      </p>

      <WhenWho project={project} dispatch={dispatch} showPicker={ownerView} />

      {/* The EST→PAID fill is the owner's rule. A worker's payload carries no
          estimates and no payments, and the bar was drawing that hole as an
          empty gauge reading $0.00. */}
      {ownerView && (
        <div className="mt-3.5">
          <div className="h-1 bg-sunk">
            <div
              className="h-full transition-[width] duration-[380ms] ease-instrument"
              style={{ width: `${pct}%`, background: "var(--emerald)" }}
            />
          </div>
          <div className="mt-1.5 flex items-baseline gap-1.5">
            <span className="eyebrow" style={{ color: "var(--emerald-ink)" }}>
              PAID <Money cents={paidCents} className="t-meta font-bold" />
            </span>
            <span className="eyebrow">
              / EST {estCents != null ? <Money cents={estCents} className="t-meta" /> : "—"}
            </span>
          </div>
        </div>
      )}
    </Ticket>
  );
}

/** BOOKED — a standard ruled row, hanging to the right of its date rail. */
function BookedRow({
  project,
  dispatch,
  ownerView,
}: {
  project: Project;
  dispatch: Dispatch;
  ownerView: boolean;
}) {
  const estCents = estCentsOf(project);
  const done = project.tasks.filter((t) => t.status === "DONE").length;
  return (
    <Row status={project.status} className="row-hover">
      <Link
        href={`/projects/${project.id}`}
        className="absolute inset-0"
        aria-label={`Open ${project.title}`}
      />
      {/* Wraps rather than squeezes. At 390px the right cluster used to be pushed
          off the screen by the date rail — the answer to «who» was past the edge. */}
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2">
        <div className="min-w-0 flex-1 basis-[190px]">
          <span className="whitespace-nowrap">
            <WoNumber id={project.id} date={project.createdAt} />
          </span>
          <p className="t-row mt-1 truncate font-bold text-ink">{project.title}</p>
          <p className="t-body truncate text-ink-2">
            {project.clientName} · {project.address}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-4">
          <div className="text-right">
            {ownerView && estCents != null && (
              <div className="eyebrow">
                EST <Money cents={estCents} className="t-body text-ink-2" />
              </div>
            )}
            {project.tasks.length > 0 && (
              <div className="eyebrow mt-1">
                TASKS <Num>{done}</Num>/<Num>{project.tasks.length}</Num>
              </div>
            )}
          </div>
          {ownerView ? (
            <CrewPicker project={project} dispatch={dispatch} />
          ) : project.assignedTo ? (
            <span className="eyebrow shrink-0">{project.assignedTo.name}</span>
          ) : null}
        </div>
      </div>
    </Row>
  );
}

/** CLOSED — the drawer: one compressed ledger line per order. */
function ClosedRow({ project, ownerView }: { project: Project; ownerView: boolean }) {
  const paidCents = paidCentsOf(project);
  const estCents = estCentsOf(project);
  const moneyCents = paidCents > 0 ? paidCents : estCents ?? 0;
  return (
    <Row href={`/projects/${project.id}`} status={project.status} className="!py-2">
      <div className="t-body flex min-w-0 items-baseline gap-3">
        <span className="hidden whitespace-nowrap sm:inline">
          <WoNumber id={project.id} date={project.createdAt} />
        </span>
        <span className="truncate font-medium text-ink-2">{project.title}</span>
        <span className="hidden min-w-0 truncate text-ink-3 sm:inline">
          {project.clientName}
        </span>
        <span className="ml-auto flex shrink-0 items-baseline gap-3">
          <span className="eyebrow" style={{ color: textToneFor(project.status) }}>
            {project.status.replace("_", " ")}
          </span>
          {ownerView &&
            (moneyCents > 0 ? (
              <Money cents={moneyCents} className="t-body" tone="var(--ink-3)" />
            ) : (
              <span className="mono t-body text-ink-3">—</span>
            ))}
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

  /* The ladder split. The server already narrows by statusFilter; the split
     just routes what came back into the right rung. */
  const live = projects.filter((p) => p.status === "IN_PROGRESS");
  const booked = projects.filter((p) => p.status === "SCHEDULED");
  const closed = projects.filter(
    (p) => p.status === "COMPLETED" || p.status === "CANCELLED"
  );
  const bookedGroups = groupByDate(booked);

  /** The crew is served the same board with the money taken out of the payload. */
  const ownerView = !projects.some((p) => p.viewerRole === "WORKER");

  const showLive = !statusFilter || statusFilter === "IN_PROGRESS";
  const showBooked = !statusFilter || statusFilter === "SCHEDULED";
  const showClosed =
    !statusFilter || statusFilter === "COMPLETED" || statusFilter === "CANCELLED";

  const filtering = Boolean(search || statusFilter);
  /** A filter that matched nothing is one answer, not three empty lanes. */
  const noMatch = !loading && filtering && projects.length === 0;

  function clearFilters() {
    setSearch("");
    setStatusFilter("");
  }

  /* Search and the state filter narrow the WHOLE screen, so they sit on the
     screen's own rule under the page head — the same place the receivables book,
     Finance and Reports keep theirs. Folded into the first lane's head they read
     as that lane's controls, and whichever lane happened to come first was the
     one lane without a count beside its name. */
  const controls = (
    <div className="flex flex-wrap items-center gap-1.5 border-b border-line pb-4">
      {/* Both boxes are `.control`, so the search and the filter are the same height
          as every other field in the product. `.control` is width:100%, which is why
          each one is sized by the box it sits in rather than by a width utility. */}
      <div className="relative w-[168px] sm:w-[210px]">
        <label className="sr-only" htmlFor="jobs-search">
          Search jobs
        </label>
        <Search
          className="pointer-events-none absolute left-2.5 top-1/2 z-[1] h-3.5 w-3.5 -translate-y-1/2 text-ink-3"
          strokeWidth={2}
          aria-hidden
        />
        <input
          id="jobs-search"
          placeholder="Search jobs…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className={controlClass("!pl-8")}
        />
      </div>
      <div className="w-[132px]">
        <label className="sr-only" htmlFor="jobs-status">
          Job state
        </label>
        <select
          id="jobs-status"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className={controlClass("mono uppercase tracking-[0.06em]")}
        >
          <option value="">All states</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {s.replace("_", " ")}
            </option>
          ))}
        </select>
      </div>
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
        <Plate className="page-doc p-5">
          <div className="eyebrow">New job</div>
          <form onSubmit={handleAddProject} className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field
              id="job-client-pick"
              label="Existing client"
              hint="Pick a repeat customer and the details fill themselves in."
              className="sm:col-span-2"
            >
              {(f) => (
                <select
                  {...f}
                  value={form.clientId}
                  onChange={(e) => pickClient(e.target.value)}
                >
                  <option value="">— New client, type the details below —</option>
                  {clients.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                      {c.address ? ` · ${c.address}` : ""}
                    </option>
                  ))}
                </select>
              )}
            </Field>

            {[
              { id: "job-client-name", label: "Client name", key: "clientName", type: "text", required: true },
              { id: "job-phone", label: "Phone", key: "phone", type: "tel", mono: true, w: "sm:max-w-[240px]" },
              { id: "job-email", label: "Email", key: "email", type: "email" },
              { id: "job-type", label: "Job type", key: "jobType", type: "text", w: "sm:max-w-[280px]" },
              { id: "job-day", label: "Scheduled day", key: "scheduledDate", type: "date", mono: true, w: "sm:max-w-[186px]" },
            ].map(({ id, label, key, type, required, mono, w }) => (
              <Field key={key} id={id} label={label} required={required} className={w}>
                {(f) => (
                  <input
                    {...f}
                    type={type}
                    value={(form as Record<string, string>)[key] || ""}
                    onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                    className={mono ? `${f.className} mono` : f.className}
                  />
                )}
              </Field>
            ))}

            <Field id="job-title" label="Job title" required className="sm:col-span-2">
              {(f) => (
                <input
                  {...f}
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                />
              )}
            </Field>
            <Field id="job-address" label="Address" required className="sm:col-span-2">
              {(f) => (
                <input
                  {...f}
                  value={form.address}
                  onChange={(e) => setForm({ ...form, address: e.target.value })}
                />
              )}
            </Field>
            <Field id="job-description" label="What the work is" className="sm:col-span-2">
              {(f) => (
                <textarea
                  {...f}
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  rows={2}
                />
              )}
            </Field>

            <div className="actions sm:col-span-2">
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

      {controls}

      {loading ? (
        <section>
          <LaneHead title="On the go" lamp="var(--amber)" />
          <Skeleton lines={4} />
        </section>
      ) : noMatch ? (
        /* One answer instead of three. A filter that matched nothing used to
           print «nothing on the desk», «nothing on the peg» and «the drawer is
           empty» in a column, and never named the search that caused them. */
        <section>
          <LaneHead title="Nothing found" />
          <Empty
            /* The typed words go in the hint, in the case the person typed them:
               the first line is a mono eyebrow and would shout «ZZZZZ» back at him. */
            hint={
              search
                ? `Nothing matches “${search}”. The search runs over the job title, the client and the address.`
                : "No job is in that state right now."
            }
            action={
              <button onClick={clearFilters} className={buttonClass("ghost")}>
                Clear search
              </button>
            }
          >
            No job matches that
          </Empty>
        </section>
      ) : (
        <>
          {/* RUNG 1 — ON THE GO: each live job is a full work-order plate. */}
          {showLive && (
            <section>
              <LaneHead
                title="On the go"
                lamp="var(--amber)"
                count={live.length}
                unit="job"
              />
              {live.length === 0 ? (
                <Empty hint="A booked job lands here the moment the crew hits Start on it.">
                  Nothing on the desk — no jobs running
                </Empty>
              ) : (
                <div className="flex flex-col gap-3">
                  {live.map((p) => (
                    <LiveTicket
                      key={p.id}
                      project={p}
                      dispatch={dispatch}
                      ownerView={ownerView}
                    />
                  ))}
                </div>
              )}
            </section>
          )}

          {/* RUNG 2 — BOOKED: rows hung on a date rail, board-style numerals. */}
          {showBooked && (
            <section>
              <LaneHead
                title="Booked"
                lamp="var(--sky)"
                count={booked.length}
                unit="job"
              />
              {booked.length === 0 ? (
                <Empty
                  hint="Open a work order and give it a day — it hangs on the peg until the crew starts."
                  action={
                    ownerView ? (
                      <button
                        onClick={() => setShowAddForm(true)}
                        className={buttonClass("ghost")}
                      >
                        New job
                      </button>
                    ) : undefined
                  }
                >
                  Nothing on the peg — no work booked
                </Empty>
              ) : (
                <div className="border-t border-line">
                  {bookedGroups.map((g) => (
                    <div
                      key={g.key}
                      className="grid grid-cols-[44px_1fr] border-b border-line last:border-b-0 sm:grid-cols-[64px_1fr]"
                    >
                      <div className="border-r border-line pr-2 pt-4">
                        <div className="mono t-record font-medium text-ink">{g.day}</div>
                        <div className="eyebrow mt-1.5">{g.mon}</div>
                      </div>
                      <div className="min-w-0">
                        {g.items.map((p) => (
                          <BookedRow
                            key={p.id}
                            project={p}
                            dispatch={dispatch}
                            ownerView={ownerView}
                          />
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
                title="Closed"
                count={closed.length}
                unit="job"
              />
              {closed.length === 0 ? (
                <Empty hint="Finished and cancelled orders drop in here and stay searchable.">
                  The drawer is empty — no closed orders
                </Empty>
              ) : (
                <div className="border-t border-line">
                  {closed.map((p) => (
                    <ClosedRow key={p.id} project={p} ownerView={ownerView} />
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
