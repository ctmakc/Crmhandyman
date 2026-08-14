"use client";

import { useEffect, useState } from "react";
import { Plus, X } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  PageHead,
  Plate,
  LaneHead,
  Empty,
  Field,
  Stamp,
  buttonClass,
  spineFor,
} from "@/components/ui/primitives";
import { toast } from "@/components/ui/Toaster";

interface Task {
  id: string;
  title: string;
  description?: string;
  status: string;
  dueDate?: string;
  assignedTo: { id: string; name: string };
  project?: { id: string; title: string };
}

interface User {
  id: string;
  name: string;
}

/**
 * THE WHITEBOARD — the crew device (DESIGN.md revision 3).
 *
 * Three lanes on the desk, separated by a rule rather than boxed in a frame. On a
 * phone the three lanes stacked into one 1600px column, so «ON THE TRUCK» sat five
 * cards below the fold and the board stopped being a board: the lane strip below
 * shows one lane at a time with the count of the other two still visible.
 */
const COLUMNS = [
  { id: "TODO", label: "Queued", empty: "Nothing queued", hint: "New work for the crew lands here first." },
  {
    id: "IN_PROGRESS",
    label: "On the truck",
    empty: "Nobody is on anything",
    hint: "A task moves here when the man who has it starts it.",
  },
  {
    id: "DONE",
    label: "Closed",
    empty: "Nothing closed yet",
    hint: "Finished tasks stay here so the week can be read back.",
  },
];

export default function TasksPage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ title: "", description: "", assignedToId: "", dueDate: "" });
  const [dragging, setDragging] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  /** Ids that just changed column — drives the signature ticket-snap. */
  const [snapped, setSnapped] = useState<string | null>(null);
  /** The phone shows one lane at a time; the desk shows all three. */
  const [openLane, setOpenLane] = useState("TODO");

  async function fetchData() {
    const [tasksRes, usersRes] = await Promise.all([
      fetch("/api/tasks"),
      fetch("/api/settings/users"),
    ]);
    setTasks(await tasksRes.json());
    setUsers(await usersRes.json());
  }

  useEffect(() => {
    fetchData();
  }, []);

  async function handleAddTask(e: React.FormEvent) {
    e.preventDefault();
    await fetch("/api/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    setForm({ title: "", description: "", assignedToId: "", dueDate: "" });
    setShowForm(false);
    toast("Task added");
    fetchData();
  }

  async function handleStatusChange(taskId: string, status: string) {
    await fetch(`/api/tasks/${taskId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    setTasks((prev) => prev.map((t) => (t.id === taskId ? { ...t, status } : t)));
    setSnapped(taskId);
    setTimeout(() => setSnapped((cur) => (cur === taskId ? null : cur)), 300);
  }

  /* Removal is signed for everywhere else in the product — a photo asks, a crew
     member asks. A 14px unlabelled bin on a card that a gloved thumb drags was
     the one place work disappeared on a single mis-tap. */
  async function handleDelete(taskId: string, title: string) {
    if (!confirm(`Take «${title}» off the board? It cannot be put back.`)) return;
    const res = await fetch(`/api/tasks/${taskId}`, { method: "DELETE" });
    if (!res.ok) {
      toast("That task is still on the board — no answer from the office", "bad");
      return;
    }
    setTasks((prev) => prev.filter((t) => t.id !== taskId));
    toast("Task removed");
  }

  function handleDrop(status: string) {
    setDropTarget(null);
    if (dragging) {
      handleStatusChange(dragging, status);
      setDragging(null);
    }
  }

  return (
    <div className="space-y-6 pb-24 md:pb-6">
      <PageHead
        eyebrow="The whiteboard"
        title="Crew"
        sub="Every task the crew is holding. Drag a ticket between lanes on the desk, or move it with the lane box on the card."
        action={
          <button onClick={() => setShowForm((v) => !v)} className={buttonClass("primary")}>
            {showForm ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
            {showForm ? "Close" : "New task"}
          </button>
        }
      />

      {showForm && (
        <Plate className="page-doc p-5">
          <div className="eyebrow">New crew task</div>
          <form onSubmit={handleAddTask} className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field id="task-title" label="What has to be done" required className="sm:col-span-2">
              {(f) => (
                <input
                  {...f}
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                />
              )}
            </Field>
            <Field id="task-assignee" label="Who takes it">
              {(f) => (
                <select
                  {...f}
                  value={form.assignedToId}
                  onChange={(e) => setForm({ ...form, assignedToId: e.target.value })}
                >
                  <option value="">— Me —</option>
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name}
                    </option>
                  ))}
                </select>
              )}
            </Field>
            <Field id="task-due" label="Due day">
              {(f) => (
                <input
                  {...f}
                  type="date"
                  className={`${f.className} mono`}
                  value={form.dueDate}
                  onChange={(e) => setForm({ ...form, dueDate: e.target.value })}
                />
              )}
            </Field>
            <Field id="task-description" label="Anything the man needs to know" className="sm:col-span-2">
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
                Add task
              </button>
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className={buttonClass("ghost")}
              >
                Cancel
              </button>
            </div>
          </form>
        </Plate>
      )}

      {/* THE LANE STRIP — the phone's board. Three lanes will not fit side by side at
          390px, and stacked they buried the second lane under five cards. */}
      <div className="flex border-b border-line md:hidden" role="group" aria-label="Lanes">
        {COLUMNS.map((col) => {
          const n = tasks.filter((t) => t.status === col.id).length;
          const on = openLane === col.id;
          return (
            <button
              key={col.id}
              onClick={() => setOpenLane(col.id)}
              aria-pressed={on}
              className={cn(
                "flex-1 border-b-2 px-2 pb-2.5 pt-1 text-left transition-colors duration-fast ease-instrument",
                on ? "border-navy-900" : "border-transparent"
              )}
            >
              <span className={cn("eyebrow block", on && "text-ink")}>{col.label}</span>
              <span
                className={cn("mono t-row mt-1 block font-bold", on ? "text-ink" : "text-ink-3")}
              >
                {n}
              </span>
            </button>
          );
        })}
      </div>

      {/* Lanes: three channels of the deck, divided by a rule. The v1 board was one
          bordered rectangle of three equal boxes — the shape the 2026-07-27 revision
          took out of every other screen. */}
      <div className="grid grid-cols-1 gap-x-6 md:grid-cols-3">
        {COLUMNS.map((col, i) => {
          const colTasks = tasks.filter((t) => t.status === col.id);
          const isTarget = dropTarget === col.id;
          return (
            <div
              key={col.id}
              className={cn(
                "min-w-0 md:min-h-[220px] md:pl-6",
                i > 0 && "md:border-l md:border-line",
                openLane === col.id ? "block" : "hidden md:block"
              )}
              onDragOver={(e) => {
                e.preventDefault();
                setDropTarget(col.id);
              }}
              onDragLeave={() => setDropTarget((c) => (c === col.id ? null : c))}
              onDrop={() => handleDrop(col.id)}
            >
              {/* The lane head is a rule on the desk; on the phone the strip above
                  already names the lane, so it stays out of the way. */}
              {/* One counter shape for the product: right end of the head, mono,
                  no leading zero. `05` was a private spelling of `5`. */}
              <div className="mb-3 hidden md:block">
                <LaneHead title={col.label} count={colTasks.length} unit="task" />
              </div>

              <div
                className={cn(
                  "space-y-2.5 transition-colors duration-fast ease-instrument",
                  isTarget && "bg-sunk"
                )}
              >
                {colTasks.map((task) => (
                  <div
                    key={task.id}
                    draggable
                    onDragStart={() => setDragging(task.id)}
                    onDragEnd={() => setDragging(null)}
                    className={cn(
                      "ticket ticket-hover cursor-grab px-3 py-2.5 active:cursor-grabbing",
                      snapped === task.id && "ticket-snap"
                    )}
                    style={
                      {
                        ["--spine"]: spineFor(task.status),
                        opacity: dragging === task.id ? 0.5 : 1,
                      } as React.CSSProperties
                    }
                  >
                    <p className="t-row font-bold leading-snug text-ink">{task.title}</p>
                    {task.description && (
                      <p className="t-meta mt-1 line-clamp-2 text-ink-2">{task.description}</p>
                    )}
                    <div className="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
                      <span className="eyebrow">{task.assignedTo.name}</span>
                      {task.project && (
                        <span className="t-meta min-w-0 truncate text-ink-2">
                          {task.project.title}
                        </span>
                      )}
                      {task.dueDate && <Stamp date={task.dueDate} className="eyebrow" />}
                    </div>

                    {/* Moving and binning a ticket live at the bottom of it, at row
                        scale. The bin used to be a bare cross above the title — the
                        loudest thing on every card was the one action nobody wants. */}
                    <div className="mt-2.5 flex items-center gap-2 border-t border-line pt-2">
                      <label className="sr-only" htmlFor={`lane-${task.id}`}>
                        Lane for {task.title}
                      </label>
                      {/* Full width it became a slab on every card repeating the name
                          of the lane it already sits in. It is the keyboard and phone
                          path, so it stays — at the width of its own longest word. */}
                      <select
                        id={`lane-${task.id}`}
                        value={task.status}
                        onChange={(e) => handleStatusChange(task.id, e.target.value)}
                        className="mono t-micro min-w-0 flex-1 px-2 py-1 uppercase leading-[16px] tracking-[0.06em] md:flex-none md:w-[136px]"
                      >
                        <option value="TODO">Queued</option>
                        <option value="IN_PROGRESS">On the truck</option>
                        <option value="DONE">Closed</option>
                      </select>
                      <button
                        onClick={() => handleDelete(task.id, task.title)}
                        className={`${buttonClass("quiet")} ml-auto shrink-0 hover:border-rose hover:text-rose`}
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                ))}

                {colTasks.length === 0 && (
                  <Empty hint={col.hint}>{col.empty}</Empty>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
