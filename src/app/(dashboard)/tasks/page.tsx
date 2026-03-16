"use client";

import { useEffect, useState } from "react";
import { Plus, X } from "lucide-react";
import { formatDate } from "@/lib/utils";

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

const columns = [
  { id: "TODO", label: "To Do", color: "bg-gray-100" },
  { id: "IN_PROGRESS", label: "In Progress", color: "bg-blue-100" },
  { id: "DONE", label: "Done", color: "bg-green-100" },
];

export default function TasksPage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ title: "", description: "", assignedToId: "", dueDate: "" });
  const [dragging, setDragging] = useState<string | null>(null);

  async function fetchData() {
    const [tasksRes, usersRes] = await Promise.all([
      fetch("/api/tasks"),
      fetch("/api/settings/users"),
    ]);
    setTasks(await tasksRes.json());
    setUsers(await usersRes.json());
  }

  useEffect(() => { fetchData(); }, []);

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
    // Optimistically update
    setTasks(prev => prev.map(t => t.id === taskId ? { ...t, status } : t));
  }

  async function handleDelete(taskId: string) {
    await fetch(`/api/tasks/${taskId}`, { method: "DELETE" });
    setTasks(prev => prev.filter(t => t.id !== taskId));
  }

  function handleDragStart(taskId: string) {
    setDragging(taskId);
  }

  function handleDrop(status: string) {
    if (dragging) {
      handleStatusChange(dragging, status);
      setDragging(null);
    }
  }

  return (
    <div className="space-y-4 pb-20 md:pb-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Tasks</h1>
        <button onClick={() => setShowForm(true)}
          className="flex items-center gap-1.5 bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700">
          <Plus className="h-4 w-4" /> New Task
        </button>
      </div>

      {/* Add Task Form */}
      {showForm && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
          <h2 className="font-semibold mb-3">New Task</h2>
          <form onSubmit={handleAddTask} className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="sm:col-span-2">
              <label className="text-xs font-medium text-gray-600">Title *</label>
              <input required value={form.title} onChange={e => setForm({...form, title: e.target.value})}
                className="w-full mt-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600">Assign To</label>
              <select value={form.assignedToId} onChange={e => setForm({...form, assignedToId: e.target.value})}
                className="w-full mt-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option value="">— Self —</option>
                {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600">Due Date</label>
              <input type="date" value={form.dueDate} onChange={e => setForm({...form, dueDate: e.target.value})}
                className="w-full mt-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div className="sm:col-span-2">
              <label className="text-xs font-medium text-gray-600">Description</label>
              <textarea value={form.description} onChange={e => setForm({...form, description: e.target.value})}
                rows={2}
                className="w-full mt-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div className="sm:col-span-2 flex gap-2">
              <button type="submit" className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700">Add Task</button>
              <button type="button" onClick={() => setShowForm(false)}
                className="border border-gray-300 text-gray-700 px-4 py-2 rounded-lg text-sm hover:bg-gray-50">Cancel</button>
            </div>
          </form>
        </div>
      )}

      {/* Kanban Board */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {columns.map(col => {
          const colTasks = tasks.filter(t => t.status === col.id);
          return (
            <div
              key={col.id}
              className={`${col.color} rounded-xl p-3 min-h-40`}
              onDragOver={e => e.preventDefault()}
              onDrop={() => handleDrop(col.id)}
            >
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold text-gray-700 text-sm">{col.label}</h3>
                <span className="text-xs bg-white rounded-full px-2 py-0.5 text-gray-500 font-medium">
                  {colTasks.length}
                </span>
              </div>
              <div className="space-y-2">
                {colTasks.map(task => (
                  <div
                    key={task.id}
                    draggable
                    onDragStart={() => handleDragStart(task.id)}
                    className="bg-white rounded-lg p-3 shadow-sm cursor-grab active:cursor-grabbing border border-gray-100 hover:shadow-md transition-shadow"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="font-medium text-gray-900 text-sm leading-snug">{task.title}</p>
                      <button onClick={() => handleDelete(task.id)}
                        className="shrink-0 text-gray-300 hover:text-red-500 transition-colors">
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    {task.description && (
                      <p className="text-xs text-gray-500 mt-1 line-clamp-2">{task.description}</p>
                    )}
                    <div className="flex items-center gap-2 mt-2 flex-wrap">
                      <span className="text-xs bg-gray-100 text-gray-600 rounded px-1.5 py-0.5">
                        {task.assignedTo.name}
                      </span>
                      {task.project && (
                        <span className="text-xs bg-blue-50 text-blue-600 rounded px-1.5 py-0.5 truncate max-w-24">
                          {task.project.title}
                        </span>
                      )}
                      {task.dueDate && (
                        <span className="text-xs text-gray-400">{formatDate(task.dueDate)}</span>
                      )}
                    </div>
                    {/* Quick status change on mobile */}
                    <select
                      value={task.status}
                      onChange={e => handleStatusChange(task.id, e.target.value)}
                      className="mt-2 w-full text-xs border border-gray-200 rounded px-1 py-1 text-gray-600 md:hidden"
                    >
                      <option value="TODO">To Do</option>
                      <option value="IN_PROGRESS">In Progress</option>
                      <option value="DONE">Done</option>
                    </select>
                  </div>
                ))}
                {colTasks.length === 0 && (
                  <p className="text-xs text-gray-400 text-center py-4">Drop tasks here</p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
