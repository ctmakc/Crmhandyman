"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Plus, Search } from "lucide-react";
import { formatCurrency } from "@/lib/utils";

interface Project {
  id: string;
  title: string;
  clientName: string;
  address: string;
  status: string;
  scheduledDate?: string;
  jobType?: string;
  payments: { amount: number }[];
  estimates: { total: number; status: string }[];
  tasks: { id: string; status: string }[];
}

const statusColors: Record<string, string> = {
  SCHEDULED: "bg-yellow-100 text-yellow-700",
  IN_PROGRESS: "bg-blue-100 text-blue-700",
  COMPLETED: "bg-green-100 text-green-700",
  CANCELLED: "bg-red-100 text-red-700",
};

export default function ProjectsPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [showAddForm, setShowAddForm] = useState(false);
  const [form, setForm] = useState({
    clientName: "", phone: "", email: "", address: "",
    title: "", description: "", jobType: "", scheduledDate: ""
  });

  async function fetchProjects() {
    const params = new URLSearchParams();
    if (search) params.set("q", search);
    if (statusFilter) params.set("status", statusFilter);
    const res = await fetch(`/api/projects?${params}`);
    const data = await res.json();
    setProjects(data);
    setLoading(false);
  }

  useEffect(() => { fetchProjects(); }, [search, statusFilter]);

  async function handleAddProject(e: React.FormEvent) {
    e.preventDefault();
    await fetch("/api/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    setShowAddForm(false);
    setForm({ clientName: "", phone: "", email: "", address: "", title: "", description: "", jobType: "", scheduledDate: "" });
    fetchProjects();
  }

  return (
    <div className="space-y-4 pb-20 md:pb-0">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Projects</h1>
        <button onClick={() => setShowAddForm(true)}
          className="flex items-center gap-1.5 bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors">
          <Plus className="h-4 w-4" /> New Project
        </button>
      </div>

      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
          <input type="text" placeholder="Search projects..." value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
          <option value="">All Statuses</option>
          {["SCHEDULED", "IN_PROGRESS", "COMPLETED", "CANCELLED"].map(s => (
            <option key={s} value={s}>{s.replace("_", " ")}</option>
          ))}
        </select>
      </div>

      {showAddForm && (
        <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
          <h2 className="font-semibold mb-4">New Project</h2>
          <form onSubmit={handleAddProject} className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {[
              { label: "Client Name *", field: "clientName", type: "text", required: true },
              { label: "Phone", field: "phone", type: "tel" },
              { label: "Email", field: "email", type: "email" },
              { label: "Job Type", field: "jobType", type: "text" },
              { label: "Scheduled Date", field: "scheduledDate", type: "date" },
            ].map(({ label, field, type, required }) => (
              <div key={field}>
                <label className="text-xs font-medium text-gray-600">{label}</label>
                <input required={required} type={type}
                  value={(form as Record<string, string>)[field] || ""}
                  onChange={e => setForm({...form, [field]: e.target.value})}
                  className="w-full mt-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
            ))}
            <div className="sm:col-span-2">
              <label className="text-xs font-medium text-gray-600">Project Title *</label>
              <input required value={form.title} onChange={e => setForm({...form, title: e.target.value})}
                className="w-full mt-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div className="sm:col-span-2">
              <label className="text-xs font-medium text-gray-600">Address *</label>
              <input required value={form.address} onChange={e => setForm({...form, address: e.target.value})}
                className="w-full mt-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div className="sm:col-span-2">
              <label className="text-xs font-medium text-gray-600">Description</label>
              <textarea value={form.description} onChange={e => setForm({...form, description: e.target.value})}
                rows={2}
                className="w-full mt-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div className="sm:col-span-2 flex gap-2">
              <button type="submit" className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700">Add Project</button>
              <button type="button" onClick={() => setShowAddForm(false)}
                className="border border-gray-300 text-gray-700 px-4 py-2 rounded-lg text-sm hover:bg-gray-50">Cancel</button>
            </div>
          </form>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {loading ? (
          <div className="col-span-2 p-8 text-center text-gray-500">Loading...</div>
        ) : projects.length === 0 ? (
          <div className="col-span-2 p-8 text-center text-gray-500">No projects found.</div>
        ) : (
          projects.map((project) => {
            const totalPaid = project.payments.reduce((s, p) => s + p.amount, 0);
            const latestEstimate = project.estimates[0];
            const doneTasks = project.tasks.filter(t => t.status === "DONE").length;
            return (
              <Link key={project.id} href={`/projects/${project.id}`}
                className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 hover:shadow-md transition-shadow">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="font-semibold text-gray-900 truncate">{project.title}</h3>
                    <p className="text-sm text-gray-500">{project.clientName}</p>
                    <p className="text-xs text-gray-400 mt-0.5 truncate">{project.address}</p>
                  </div>
                  <span className={`shrink-0 text-xs px-2 py-0.5 rounded-full font-medium ${statusColors[project.status]}`}>
                    {project.status.replace("_", " ")}
                  </span>
                </div>
                <div className="flex items-center gap-4 mt-3 text-xs text-gray-500">
                  {latestEstimate && (
                    <span>Est: {formatCurrency(latestEstimate.total)}</span>
                  )}
                  {totalPaid > 0 && (
                    <span className="text-green-600">Paid: {formatCurrency(totalPaid)}</span>
                  )}
                  {project.tasks.length > 0 && (
                    <span>Tasks: {doneTasks}/{project.tasks.length}</span>
                  )}
                  {project.scheduledDate && (
                    <span>{new Date(project.scheduledDate).toLocaleDateString("en-CA")}</span>
                  )}
                </div>
              </Link>
            );
          })
        )}
      </div>
    </div>
  );
}
