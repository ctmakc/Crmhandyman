"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Plus, Search, X } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import {
  PageHead,
  Ticket,
  WoNumber,
  Empty,
  Plate,
  buttonClass,
  Skeleton,
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

interface Project {
  id: string;
  title: string;
  clientName: string;
  address: string;
  status: string;
  createdAt?: string;
  scheduledDate?: string;
  jobType?: string;
  payments: { amount: number }[];
  estimates: { total: number; status: string }[];
  tasks: { id: string; status: string }[];
}

const STATUSES = ["SCHEDULED", "IN_PROGRESS", "COMPLETED", "CANCELLED"];

export default function ProjectsPage() {
  const searchParams = useSearchParams();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [showAddForm, setShowAddForm] = useState(false);
  const [clients, setClients] = useState<ClientOption[]>([]);
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
    const data = await res.json();
    setProjects(data);
    setLoading(false);
  }

  useEffect(() => {
    fetchProjects();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, statusFilter]);

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

  return (
    <div className="space-y-6 pb-24 md:pb-0">
      <PageHead
        eyebrow="Work orders"
        title="Jobs"
        sub="Booked, running and closed work — one ticket each."
        action={
          <button onClick={() => setShowAddForm((v) => !v)} className={buttonClass("primary")}>
            {showAddForm ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
            {showAddForm ? "Close" : "New job"}
          </button>
        }
      />

      <div className="flex flex-col gap-2 border border-line bg-sunk p-2 sm:flex-row">
        <div className="relative flex-1">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-3"
            strokeWidth={2}
          />
          <input
            placeholder="Search client, title, address…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full py-2 pl-9 pr-3 text-[13px]"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="mono px-3 py-2 text-[12px] uppercase tracking-[0.06em]"
        >
          <option value="">All statuses</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {s.replace("_", " ")}
            </option>
          ))}
        </select>
      </div>

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

      <div className="grid gap-2.5 lg:grid-cols-2">
        {loading ? (
          <div className="lg:col-span-2">
            <Skeleton lines={4} />
          </div>
        ) : projects.length === 0 ? (
          <div className="lg:col-span-2">
            <Empty>No jobs match this filter</Empty>
          </div>
        ) : (
          projects.map((project) => {
            const totalPaid = project.payments.reduce((s, p) => s + p.amount, 0);
            const latestEstimate = project.estimates[0];
            const doneTasks = project.tasks.filter((t) => t.status === "DONE").length;
            return (
              <Ticket key={project.id} href={`/projects/${project.id}`} status={project.status}>
                <div className="flex items-baseline justify-between gap-3">
                  <WoNumber id={project.id} date={project.createdAt} />
                  <span className="eyebrow">{project.status.replace("_", " ")}</span>
                </div>
                <p className="mt-1.5 truncate text-[15px] font-bold leading-tight text-ink">
                  {project.title}
                </p>
                <p className="truncate text-[13px] text-ink-2">
                  {project.clientName} · {project.address}
                </p>
                <div className="mt-2.5 flex flex-wrap items-baseline gap-x-4 gap-y-1 border-t border-line pt-2.5">
                  {latestEstimate && (
                    <span className="mono text-[12px] text-ink-2">
                      EST {formatCurrency(latestEstimate.total)}
                    </span>
                  )}
                  {totalPaid > 0 && (
                    <span className="mono text-[12px]" style={{ color: "var(--emerald)" }}>
                      PAID {formatCurrency(totalPaid)}
                    </span>
                  )}
                  {project.tasks.length > 0 && (
                    <span className="mono text-[12px] text-ink-3">
                      CREW {doneTasks}/{project.tasks.length}
                    </span>
                  )}
                  {project.scheduledDate && (
                    <span className="mono text-[12px] text-ink-3">
                      {new Date(project.scheduledDate).toLocaleDateString("en-CA")}
                    </span>
                  )}
                </div>
              </Ticket>
            );
          })
        )}
      </div>
    </div>
  );
}
