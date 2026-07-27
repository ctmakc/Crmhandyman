"use client";

import { useEffect, useState } from "react";
import { Plus, X } from "lucide-react";
import { formatDate } from "@/lib/utils";
import { PageHead, Plate, buttonClass, spineFor } from "@/components/ui/primitives";

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

const COLUMNS = [
  { id: "TODO", label: "Queued" },
  { id: "IN_PROGRESS", label: "On the truck" },
  { id: "DONE", label: "Closed" },
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

  async function handleDelete(taskId: string) {
    await fetch(`/api/tasks/${taskId}`, { method: "DELETE" });
    setTasks((prev) => prev.filter((t) => t.id !== taskId));
  }

  function handleDrop(status: string) {
    setDropTarget(null);
    if (dragging) {
      handleStatusChange(dragging, status);
      setDragging(null);
    }
  }

  const field = "w-full mt-1.5 px-3 py-2 text-[13px]";

  return (
    <div className="space-y-6 pb-24 md:pb-6">
      <PageHead
        eyebrow="Crew board"
        title="Tasks"
        sub="Drag a ticket between lanes — it snaps into the new state."
        action={
          <button onClick={() => setShowForm((v) => !v)} className={buttonClass("primary")}>
            {showForm ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
            {showForm ? "Close" : "New task"}
          </button>
        }
      />

      {showForm && (
        <Plate className="p-5">
          <div className="eyebrow">New crew task</div>
          <form onSubmit={handleAddTask} className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="eyebrow">Title *</label>
              <input
                required
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                className={field}
              />
            </div>
            <div>
              <label className="eyebrow">Assign to</label>
              <select
                value={form.assignedToId}
                onChange={(e) => setForm({ ...form, assignedToId: e.target.value })}
                className={field}
              >
                <option value="">— Self —</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="eyebrow">Due date</label>
              <input
                type="date"
                value={form.dueDate}
                onChange={(e) => setForm({ ...form, dueDate: e.target.value })}
                className={`${field} mono`}
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

      {/* Lanes: recessed channels in the deck, separated by hairlines. */}
      <div className="grid grid-cols-1 gap-px border border-line bg-line md:grid-cols-3">
        {COLUMNS.map((col) => {
          const colTasks = tasks.filter((t) => t.status === col.id);
          const isTarget = dropTarget === col.id;
          return (
            <div
              key={col.id}
              className="min-h-[220px] p-3 transition-colors duration-[140ms] ease-instrument"
              style={{ background: isTarget ? "var(--sunk)" : "var(--deck)" }}
              onDragOver={(e) => {
                e.preventDefault();
                setDropTarget(col.id);
              }}
              onDragLeave={() => setDropTarget((c) => (c === col.id ? null : c))}
              onDrop={() => handleDrop(col.id)}
            >
              <div className="mb-3 flex items-center justify-between border-b border-line pb-2">
                <h3 className="text-[12px] font-bold uppercase tracking-[0.08em] text-ink">
                  {col.label}
                </h3>
                <span className="mono text-[12px] font-bold text-ink-3">
                  {String(colTasks.length).padStart(2, "0")}
                </span>
              </div>

              <div className="space-y-2.5">
                {colTasks.map((task) => (
                  <div
                    key={task.id}
                    draggable
                    onDragStart={() => setDragging(task.id)}
                    onDragEnd={() => setDragging(null)}
                    className={`ticket ticket-hover cursor-grab px-3 py-2.5 active:cursor-grabbing ${
                      snapped === task.id ? "ticket-snap" : ""
                    }`}
                    style={
                      {
                        ["--spine"]: spineFor(task.status),
                        opacity: dragging === task.id ? 0.5 : 1,
                      } as React.CSSProperties
                    }
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-[14px] font-bold leading-snug text-ink">{task.title}</p>
                      <button
                        onClick={() => handleDelete(task.id)}
                        className="shrink-0 text-ink-3 transition-colors hover:text-rose"
                        aria-label="Delete task"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    {task.description && (
                      <p className="mt-1 line-clamp-2 text-[12px] text-ink-2">{task.description}</p>
                    )}
                    <div className="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-1 border-t border-line pt-2">
                      <span className="eyebrow">{task.assignedTo.name}</span>
                      {task.project && (
                        <span className="truncate text-[11px] text-ink-2">{task.project.title}</span>
                      )}
                      {task.dueDate && (
                        <span className="mono text-[11px] text-ink-3">
                          {formatDate(task.dueDate)}
                        </span>
                      )}
                    </div>
                    <select
                      value={task.status}
                      onChange={(e) => handleStatusChange(task.id, e.target.value)}
                      className="mono mt-2 w-full px-2 py-1 text-[11px] uppercase tracking-[0.06em] md:hidden"
                    >
                      <option value="TODO">Queued</option>
                      <option value="IN_PROGRESS">On the truck</option>
                      <option value="DONE">Closed</option>
                    </select>
                  </div>
                ))}
                {colTasks.length === 0 && (
                  <div className="border border-dashed border-line py-6 text-center">
                    <span className="eyebrow">Drop here</span>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
