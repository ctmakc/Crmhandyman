"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Phone, Check, X, ArrowRight } from "lucide-react";
import { Empty, Plate, buttonClass, spineFor, textToneFor } from "@/components/ui/primitives";

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

  async function fetchLead() {
    const res = await fetch(`/api/leads/${params.id}`);
    const data = await res.json();
    setLead(data);
    setForm(data);
    setConvertForm((prev) => ({
      ...prev,
      title: data.jobType ? `${data.jobType} for ${data.name}` : `Job for ${data.name}`,
      address: data.address || "",
    }));
  }

  useEffect(() => {
    fetchLead();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  if (!lead) return <Empty>Loading…</Empty>;

  const field = "w-full mt-1.5 px-3 py-2 text-[13px]";

  return (
    <div className="mx-auto max-w-3xl space-y-6 pb-24 md:pb-0">
      <Link href="/leads" className="eyebrow inline-flex items-center gap-1.5 hover:text-ink">
        <ArrowLeft className="h-3.5 w-3.5" /> All leads
      </Link>

      <div
        className="plate px-5 py-5"
        style={{ borderLeft: `4px solid ${spineFor(lead.status)}` }}
      >
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <span className="mono text-[11px] tracking-[0.08em] text-ink-3">
              LD-{new Date(lead.createdAt).getFullYear()}-{lead.id.slice(-4).toUpperCase()}
            </span>
            <h1 className="mt-1.5 text-[26px] font-black leading-none tracking-tight text-ink">
              {lead.name}
            </h1>
            <p className="mt-2 text-[14px] text-ink-2">
              {[lead.jobType, lead.city].filter(Boolean).join(" · ") || "General inquiry"}
            </p>
          </div>
          <div className="text-right">
            <span className="eyebrow" style={{ color: textToneFor(lead.status) }}>
              {lead.status}
            </span>
            <p className="eyebrow mt-2">via {lead.source}</p>
          </div>
        </div>
      </div>

      <Plate>
        <div className="flex items-center justify-between border-b border-line px-5 py-3">
          <h2 className="text-[13px] font-bold uppercase tracking-[0.06em] text-ink">Contact</h2>
          <button onClick={() => setEditing(!editing)} className="eyebrow hover:text-ink">
            {editing ? "Cancel" : "Edit"}
          </button>
        </div>

        {editing ? (
          <div className="grid grid-cols-1 gap-4 p-5 sm:grid-cols-2">
            {[
              { label: "Name", key: "name", type: "text" },
              { label: "Phone", key: "phone", type: "tel" },
              { label: "Email", key: "email", type: "email" },
              { label: "Address", key: "address", type: "text" },
              { label: "City", key: "city", type: "text" },
              { label: "Job type", key: "jobType", type: "text" },
            ].map(({ label, key, type }) => (
              <div key={key}>
                <label className="eyebrow">{label}</label>
                <input
                  type={type}
                  value={(form as Record<string, string>)[key] || ""}
                  onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                  className={key === "phone" ? `${field} mono` : field}
                />
              </div>
            ))}
            <div className="sm:col-span-2">
              <label className="eyebrow">Notes</label>
              <textarea
                value={form.notes || ""}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                rows={3}
                className={field}
              />
            </div>
            <div className="sm:col-span-2">
              <label className="eyebrow">Status</label>
              <select
                value={form.status || lead.status}
                onChange={(e) => setForm({ ...form, status: e.target.value })}
                className={`${field} mono uppercase tracking-[0.06em]`}
              >
                {["NEW", "CONTACTED", "VERIFIED", "REJECTED"].map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
            <div className="sm:col-span-2">
              <button onClick={handleSave} disabled={saving} className={buttonClass("primary")}>
                {saving ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        ) : (
          <div className="divide-y divide-line">
            {[
              ["Phone", lead.phone, `tel:${lead.phone}`],
              ["Email", lead.email, `mailto:${lead.email}`],
              ["Address", [lead.address, lead.city].filter(Boolean).join(", "), null],
              ["Logged", new Date(lead.createdAt).toLocaleDateString("en-CA"), null],
            ]
              .filter(([, v]) => v)
              .map(([k, v, href]) => (
                <div key={k as string} className="flex gap-4 px-5 py-3">
                  <span className="eyebrow w-[90px] shrink-0 pt-0.5">{k}</span>
                  {href ? (
                    <a
                      href={href as string}
                      className="mono text-[14px] text-ink underline underline-offset-4"
                    >
                      {v}
                    </a>
                  ) : (
                    <span className="text-[14px] text-ink">{v}</span>
                  )}
                </div>
              ))}
            {lead.notes && (
              <p className="bg-sunk px-5 py-3 text-[13px] text-ink-2">{lead.notes}</p>
            )}
          </div>
        )}
      </Plate>

      {lead.status !== "CONVERTED" && (
        <div className="flex flex-wrap gap-2">
          {lead.status !== "CONTACTED" && (
            <button onClick={() => handleStatusChange("CONTACTED")} className={buttonClass("ghost")}>
              <Phone className="h-3.5 w-3.5" /> Mark contacted
            </button>
          )}
          {lead.status !== "VERIFIED" && (
            <button onClick={() => handleStatusChange("VERIFIED")} className={buttonClass("ghost")}>
              <Check className="h-3.5 w-3.5" /> Verify
            </button>
          )}
          {lead.status === "VERIFIED" && !lead.project && (
            <button onClick={() => setShowConvertModal(true)} className={buttonClass("primary")}>
              <ArrowRight className="h-3.5 w-3.5" /> Open a job
            </button>
          )}
          {lead.status !== "REJECTED" && (
            <button onClick={() => handleStatusChange("REJECTED")} className={buttonClass("danger")}>
              <X className="h-3.5 w-3.5" /> Reject
            </button>
          )}
        </div>
      )}

      {lead.project && (
        <Link
          href={`/projects/${lead.project.id}`}
          className="ticket ticket-hover block px-4 py-3"
          style={{ ["--spine" as string]: spineFor(lead.project.status) } as React.CSSProperties}
        >
          <div className="eyebrow">Converted to job</div>
          <p className="mt-1.5 text-[15px] font-bold text-ink">{lead.project.title}</p>
          <p className="eyebrow mt-1">{lead.project.status.replace("_", " ")}</p>
        </Link>
      )}

      {!lead.project && (
        <button onClick={handleDelete} className="eyebrow hover:text-rose">
          Delete lead
        </button>
      )}

      {showConvertModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-navy-900/70 p-4">
          <div className="plate w-full max-w-md p-6">
            <div className="eyebrow">New work order</div>
            <h2 className="mt-2 text-[22px] font-black leading-none tracking-tight text-ink">
              Open a job
            </h2>
            <form onSubmit={handleConvert} className="mt-5 space-y-4">
              <div>
                <label className="eyebrow">Job title *</label>
                <input
                  required
                  value={convertForm.title}
                  onChange={(e) => setConvertForm({ ...convertForm, title: e.target.value })}
                  className={field}
                />
              </div>
              <div>
                <label className="eyebrow">Address *</label>
                <input
                  required
                  value={convertForm.address}
                  onChange={(e) => setConvertForm({ ...convertForm, address: e.target.value })}
                  className={field}
                />
              </div>
              <div>
                <label className="eyebrow">Scheduled date</label>
                <input
                  type="date"
                  value={convertForm.scheduledDate}
                  onChange={(e) =>
                    setConvertForm({ ...convertForm, scheduledDate: e.target.value })
                  }
                  className={`${field} mono`}
                />
              </div>
              <div>
                <label className="eyebrow">Description</label>
                <textarea
                  value={convertForm.description}
                  onChange={(e) => setConvertForm({ ...convertForm, description: e.target.value })}
                  rows={2}
                  className={field}
                />
              </div>
              <div className="flex gap-2 pt-1">
                <button
                  type="submit"
                  disabled={saving}
                  className={`${buttonClass("primary")} flex-1`}
                >
                  {saving ? "Opening…" : "Open job"}
                </button>
                <button
                  type="button"
                  onClick={() => setShowConvertModal(false)}
                  className={`${buttonClass("ghost")} flex-1`}
                >
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
