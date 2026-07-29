"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Phone, Mail, MapPin, Check, X, ArrowRight, Share2 } from "lucide-react";

interface Lead {
  id: string;
  name: string;
  phone?: string;
  email?: string;
  address?: string;
  city?: string;
  source: string;
  jobType?: string;
  notes?: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  assignedTo?: { id: string; name: string };
  project?: { id: string; title: string; status: string };
}

const statusColors: Record<string, string> = {
  NEW: "bg-blue-100 text-blue-700",
  CONTACTED: "bg-yellow-100 text-yellow-700",
  VERIFIED: "bg-green-100 text-green-700",
  REJECTED: "bg-red-100 text-red-700",
  CONVERTED: "bg-purple-100 text-purple-700",
};

export default function LeadDetailPage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const [lead, setLead] = useState<Lead | null>(null);
  const [editing, setEditing] = useState(false);
  const [showConvertModal, setShowConvertModal] = useState(false);
  const [form, setForm] = useState<Partial<Lead>>({});
  const [convertForm, setConvertForm] = useState({
    title: "",
    description: "",
    address: "",
    scheduledDate: "",
    assignedToId: "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const fetchLead = useCallback(async () => {
    const response = await fetch(`/api/leads/${params.id}`, { cache: "no-store" });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Unable to load lead.");
    setLead(data);
    setForm(data);
    setConvertForm((current) => ({
      ...current,
      title: data.jobType ? `${data.jobType} for ${data.name}` : `Job for ${data.name}`,
      address: data.address || "",
    }));
  }, [params.id]);

  useEffect(() => {
    fetchLead().catch((reason) => {
      setError(reason instanceof Error ? reason.message : "Unable to load lead.");
    });
  }, [fetchLead]);

  async function updateLead(payload: Record<string, unknown>) {
    const response = await fetch(`/api/leads/${params.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Unable to update lead.");
    return data;
  }

  async function handleSave() {
    setSaving(true);
    setError("");
    try {
      await updateLead(form as Record<string, unknown>);
      setEditing(false);
      await fetchLead();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to save lead.");
    } finally {
      setSaving(false);
    }
  }

  async function handleStatusChange(status: string) {
    if (!lead) return;
    setError("");
    try {
      await updateLead({ ...lead, status });
      await fetchLead();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to update lead status.");
    }
  }

  async function handleConvert(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      const response = await fetch(`/api/leads/${params.id}/convert`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(convertForm),
      });
      const project = await response.json();
      if (!response.ok) throw new Error(project.error || "Unable to convert lead.");
      if (project.id) router.push(`/projects/${project.id}`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to convert lead.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!confirm("Delete this lead?")) return;
    const response = await fetch(`/api/leads/${params.id}`, { method: "DELETE" });
    if (response.ok) router.push("/leads");
    else setError("Unable to delete lead.");
  }

  if (!lead) {
    return <div className="p-4 text-gray-500">{error || "Loading..."}</div>;
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4 pb-20 md:pb-0">
      <div className="flex items-center gap-3">
        <Link href="/leads" className="text-gray-500 hover:text-gray-900">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <h1 className="flex-1 text-xl font-bold text-gray-900">{lead.name}</h1>
        <span className={`rounded-full px-2 py-1 text-xs font-medium ${statusColors[lead.status] ?? "bg-gray-100 text-gray-700"}`}>
          {lead.status}
        </span>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">
          {error}
        </div>
      )}

      <div className="space-y-3 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-gray-900">Lead Info</h2>
          <button onClick={() => setEditing(!editing)} className="text-sm text-blue-600 hover:underline">
            {editing ? "Cancel" : "Edit"}
          </button>
        </div>

        {editing ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {[
              { label: "Name", field: "name", type: "text" },
              { label: "Phone", field: "phone", type: "tel" },
              { label: "Email", field: "email", type: "email" },
              { label: "Address", field: "address", type: "text" },
              { label: "City", field: "city", type: "text" },
              { label: "Job Type", field: "jobType", type: "text" },
            ].map(({ label, field, type }) => (
              <div key={field}>
                <label className="text-xs font-medium text-gray-600">{label}</label>
                <input
                  type={type}
                  value={(form as Record<string, string>)[field] || ""}
                  onChange={(event) => setForm({ ...form, [field]: event.target.value })}
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            ))}
            <div className="sm:col-span-2">
              <label className="text-xs font-medium text-gray-600">Notes</label>
              <textarea
                value={form.notes || ""}
                onChange={(event) => setForm({ ...form, notes: event.target.value })}
                rows={3}
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="text-xs font-medium text-gray-600">Status</label>
              <select
                value={form.status || lead.status}
                onChange={(event) => setForm({ ...form, status: event.target.value })}
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {["NEW", "CONTACTED", "VERIFIED", "REJECTED"].map((status) => (
                  <option key={status} value={status}>{status}</option>
                ))}
              </select>
            </div>
            <div className="flex gap-2 sm:col-span-2">
              <button
                onClick={handleSave}
                disabled={saving}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {saving ? "Saving..." : "Save"}
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-2 text-sm">
            {lead.phone && (
              <div className="flex items-center gap-2 text-gray-700">
                <Phone className="h-4 w-4 text-gray-400" />
                <a href={`tel:${lead.phone}`} className="hover:text-blue-600">{lead.phone}</a>
              </div>
            )}
            {lead.email && (
              <div className="flex items-center gap-2 text-gray-700">
                <Mail className="h-4 w-4 text-gray-400" />
                <a href={`mailto:${lead.email}`} className="hover:text-blue-600">{lead.email}</a>
              </div>
            )}
            {(lead.address || lead.city) && (
              <div className="flex items-center gap-2 text-gray-700">
                <MapPin className="h-4 w-4 text-gray-400" />
                <span>{[lead.address, lead.city].filter(Boolean).join(", ")}</span>
              </div>
            )}
            {lead.jobType && <p><span className="text-gray-500">Job:</span> {lead.jobType}</p>}
            {lead.notes && <p className="mt-2 rounded bg-gray-50 p-2 text-gray-600">{lead.notes}</p>}
            <p><span className="text-gray-500">Source:</span> {lead.source}</p>
            <p><span className="text-gray-500">Created:</span> {new Date(lead.createdAt).toLocaleDateString("en-CA")}</p>
          </div>
        )}
      </div>

      {lead.status !== "CONVERTED" && (
        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <h2 className="mb-3 font-semibold text-gray-900">Quick Actions</h2>
          <div className="flex flex-wrap gap-2">
            {lead.status !== "CONTACTED" && (
              <button onClick={() => handleStatusChange("CONTACTED")} className="flex items-center gap-1.5 rounded-lg border border-yellow-200 bg-yellow-50 px-3 py-2 text-sm text-yellow-700 hover:bg-yellow-100">
                <Phone className="h-4 w-4" /> Mark Contacted
              </button>
            )}
            {lead.status !== "VERIFIED" && (
              <button onClick={() => handleStatusChange("VERIFIED")} className="flex items-center gap-1.5 rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700 hover:bg-green-100">
                <Check className="h-4 w-4" /> Verify Lead
              </button>
            )}
            {lead.status === "VERIFIED" && !lead.project && (
              <button onClick={() => setShowConvertModal(true)} className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-sm text-white hover:bg-blue-700">
                <ArrowRight className="h-4 w-4" /> Convert to Project
              </button>
            )}
            {["NEW", "CONTACTED", "VERIFIED"].includes(lead.status) && !lead.project && (
              <Link href={`/network?publishLead=${lead.id}`} className="flex items-center gap-1.5 rounded-lg border border-orange-200 bg-orange-50 px-3 py-2 text-sm font-semibold text-orange-700 hover:bg-orange-100">
                <Share2 className="h-4 w-4" /> Send to Network
              </Link>
            )}
            {lead.status !== "REJECTED" && (
              <button onClick={() => handleStatusChange("REJECTED")} className="flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 hover:bg-red-100">
                <X className="h-4 w-4" /> Reject
              </button>
            )}
          </div>
        </div>
      )}

      {lead.project && (
        <Link href={`/projects/${lead.project.id}`} className="block rounded-xl border border-blue-200 bg-white p-4 shadow-sm transition-colors hover:bg-blue-50">
          <p className="text-sm font-medium text-blue-700">Converted to Project</p>
          <p className="mt-1 font-semibold text-gray-900">{lead.project.title}</p>
          <p className="text-sm text-gray-500">{lead.project.status}</p>
        </Link>
      )}

      {!lead.project && (
        <button onClick={handleDelete} className="text-sm text-red-500 hover:text-red-700 hover:underline">
          Delete lead
        </button>
      )}

      {showConvertModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-5 shadow-xl">
            <h2 className="mb-4 text-lg font-bold text-gray-900">Convert to Project</h2>
            <form onSubmit={handleConvert} className="space-y-3">
              <div>
                <label className="text-xs font-medium text-gray-600">Project Title *</label>
                <input required value={convertForm.title} onChange={(event) => setConvertForm({ ...convertForm, title: event.target.value })} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600">Address *</label>
                <input required value={convertForm.address} onChange={(event) => setConvertForm({ ...convertForm, address: event.target.value })} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600">Scheduled Date</label>
                <input type="date" value={convertForm.scheduledDate} onChange={(event) => setConvertForm({ ...convertForm, scheduledDate: event.target.value })} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600">Description</label>
                <textarea value={convertForm.description} onChange={(event) => setConvertForm({ ...convertForm, description: event.target.value })} rows={2} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div className="flex gap-2 pt-2">
                <button type="submit" disabled={saving} className="flex-1 rounded-lg bg-blue-600 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
                  {saving ? "Creating..." : "Create Project"}
                </button>
                <button type="button" onClick={() => setShowConvertModal(false)} className="flex-1 rounded-lg border border-gray-300 py-2 text-sm text-gray-700 hover:bg-gray-50">
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
