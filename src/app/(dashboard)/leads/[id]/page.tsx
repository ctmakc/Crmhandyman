"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Phone, Mail, MapPin, Check, X, ArrowRight } from "lucide-react";

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
    title: "", description: "", address: "", scheduledDate: "", assignedToId: ""
  });
  const [saving, setSaving] = useState(false);

  async function fetchLead() {
    const res = await fetch(`/api/leads/${params.id}`);
    const data = await res.json();
    setLead(data);
    setForm(data);
    setConvertForm(prev => ({
      ...prev,
      title: data.jobType ? `${data.jobType} for ${data.name}` : `Job for ${data.name}`,
      address: data.address || "",
    }));
  }

  useEffect(() => { fetchLead(); }, []);

  async function handleSave() {
    setSaving(true);
    await fetch(`/api/leads/${params.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    setSaving(false);
    setEditing(false);
    fetchLead();
  }

  async function handleStatusChange(status: string) {
    await fetch(`/api/leads/${params.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...lead, status }),
    });
    fetchLead();
  }

  async function handleConvert(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const res = await fetch(`/api/leads/${params.id}/convert`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(convertForm),
    });
    const project = await res.json();
    setSaving(false);
    if (project.id) router.push(`/projects/${project.id}`);
  }

  async function handleDelete() {
    if (!confirm("Delete this lead?")) return;
    await fetch(`/api/leads/${params.id}`, { method: "DELETE" });
    router.push("/leads");
  }

  if (!lead) return <div className="p-4 text-gray-500">Loading...</div>;

  return (
    <div className="max-w-2xl mx-auto space-y-4 pb-20 md:pb-0">
      <div className="flex items-center gap-3">
        <Link href="/leads" className="text-gray-500 hover:text-gray-900">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <h1 className="text-xl font-bold text-gray-900 flex-1">{lead.name}</h1>
        <span className={`text-xs px-2 py-1 rounded-full font-medium ${statusColors[lead.status]}`}>
          {lead.status}
        </span>
      </div>

      {/* Lead Info Card */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-gray-900">Lead Info</h2>
          <button onClick={() => setEditing(!editing)}
            className="text-sm text-blue-600 hover:underline">
            {editing ? "Cancel" : "Edit"}
          </button>
        </div>

        {editing ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
                  onChange={e => setForm({ ...form, [field]: e.target.value })}
                  className="w-full mt-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            ))}
            <div className="sm:col-span-2">
              <label className="text-xs font-medium text-gray-600">Notes</label>
              <textarea
                value={form.notes || ""}
                onChange={e => setForm({ ...form, notes: e.target.value })}
                rows={3}
                className="w-full mt-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="text-xs font-medium text-gray-600">Status</label>
              <select
                value={form.status || lead.status}
                onChange={e => setForm({ ...form, status: e.target.value })}
                className="w-full mt-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {["NEW", "CONTACTED", "VERIFIED", "REJECTED"].map(s => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
            <div className="sm:col-span-2 flex gap-2">
              <button onClick={handleSave} disabled={saving}
                className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
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
            {lead.notes && <p className="text-gray-600 bg-gray-50 p-2 rounded mt-2">{lead.notes}</p>}
            <p><span className="text-gray-500">Source:</span> {lead.source}</p>
            <p><span className="text-gray-500">Created:</span> {new Date(lead.createdAt).toLocaleDateString("en-CA")}</p>
          </div>
        )}
      </div>

      {/* Actions */}
      {lead.status !== "CONVERTED" && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
          <h2 className="font-semibold text-gray-900 mb-3">Quick Actions</h2>
          <div className="flex flex-wrap gap-2">
            {lead.status !== "CONTACTED" && (
              <button onClick={() => handleStatusChange("CONTACTED")}
                className="flex items-center gap-1.5 px-3 py-2 bg-yellow-50 text-yellow-700 border border-yellow-200 rounded-lg text-sm hover:bg-yellow-100">
                <Phone className="h-4 w-4" /> Mark Contacted
              </button>
            )}
            {lead.status !== "VERIFIED" && (
              <button onClick={() => handleStatusChange("VERIFIED")}
                className="flex items-center gap-1.5 px-3 py-2 bg-green-50 text-green-700 border border-green-200 rounded-lg text-sm hover:bg-green-100">
                <Check className="h-4 w-4" /> Verify Lead
              </button>
            )}
            {lead.status === "VERIFIED" && !lead.project && (
              <button onClick={() => setShowConvertModal(true)}
                className="flex items-center gap-1.5 px-3 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700">
                <ArrowRight className="h-4 w-4" /> Convert to Project
              </button>
            )}
            {lead.status !== "REJECTED" && (
              <button onClick={() => handleStatusChange("REJECTED")}
                className="flex items-center gap-1.5 px-3 py-2 bg-red-50 text-red-700 border border-red-200 rounded-lg text-sm hover:bg-red-100">
                <X className="h-4 w-4" /> Reject
              </button>
            )}
          </div>
        </div>
      )}

      {/* Linked Project */}
      {lead.project && (
        <Link href={`/projects/${lead.project.id}`}
          className="block bg-white rounded-xl border border-blue-200 shadow-sm p-4 hover:bg-blue-50 transition-colors">
          <p className="text-sm font-medium text-blue-700">Converted to Project</p>
          <p className="text-gray-900 font-semibold mt-1">{lead.project.title}</p>
          <p className="text-sm text-gray-500">{lead.project.status}</p>
        </Link>
      )}

      {/* Delete */}
      {!lead.project && (
        <button onClick={handleDelete}
          className="text-sm text-red-500 hover:text-red-700 hover:underline">
          Delete lead
        </button>
      )}

      {/* Convert Modal */}
      {showConvertModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-5">
            <h2 className="text-lg font-bold text-gray-900 mb-4">Convert to Project</h2>
            <form onSubmit={handleConvert} className="space-y-3">
              <div>
                <label className="text-xs font-medium text-gray-600">Project Title *</label>
                <input required value={convertForm.title}
                  onChange={e => setConvertForm({...convertForm, title: e.target.value})}
                  className="w-full mt-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600">Address *</label>
                <input required value={convertForm.address}
                  onChange={e => setConvertForm({...convertForm, address: e.target.value})}
                  className="w-full mt-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600">Scheduled Date</label>
                <input type="date" value={convertForm.scheduledDate}
                  onChange={e => setConvertForm({...convertForm, scheduledDate: e.target.value})}
                  className="w-full mt-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600">Description</label>
                <textarea value={convertForm.description}
                  onChange={e => setConvertForm({...convertForm, description: e.target.value})}
                  rows={2}
                  className="w-full mt-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div className="flex gap-2 pt-2">
                <button type="submit" disabled={saving}
                  className="flex-1 bg-blue-600 text-white py-2 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
                  {saving ? "Creating..." : "Create Project"}
                </button>
                <button type="button" onClick={() => setShowConvertModal(false)}
                  className="flex-1 border border-gray-300 text-gray-700 py-2 rounded-lg text-sm hover:bg-gray-50">
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
