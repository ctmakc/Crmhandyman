"use client";

import { useEffect, useState } from "react";
import { ArrowLeft, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { PageHead, Plate, buttonClass } from "@/components/ui/primitives";

interface User {
  id: string;
  name: string;
  email: string;
  role: string;
  createdAt: string;
}

export default function UsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", password: "", role: "WORKER" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function fetchUsers() {
    const res = await fetch("/api/settings/users");
    setUsers(await res.json());
  }

  useEffect(() => { fetchUsers(); }, []);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    const res = await fetch("/api/settings/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    if (res.ok) {
      setShowForm(false);
      setForm({ name: "", email: "", password: "", role: "WORKER" });
      fetchUsers();
    } else {
      const data = await res.json();
      setError(data.error || "Failed to create user");
    }
    setSaving(false);
  }

  async function handleDelete(id: string) {
    if (!confirm("Remove this team member?")) return;
    await fetch(`/api/settings/users?id=${id}`, { method: "DELETE" });
    fetchUsers();
  }

  return (
    <div className="max-w-2xl space-y-6 pb-24 md:pb-0">
      <Link href="/settings" className="eyebrow inline-flex items-center gap-1.5 hover:text-ink">
        <ArrowLeft className="h-3.5 w-3.5" /> Settings
      </Link>

      <PageHead
        eyebrow="Desk setup · 01"
        title="Team"
        action={
          <button onClick={() => setShowForm(true)} className={buttonClass("primary")}>
            <Plus className="h-4 w-4" /> Add crew
          </button>
        }
      />

      {showForm && (
        <Plate className="p-5">
          <div className="eyebrow">New team member</div>
          <form onSubmit={handleAdd} className="mt-4 space-y-4">
            <div>
              <label className="eyebrow">Full Name *</label>
              <input required value={form.name} onChange={e => setForm({...form, name: e.target.value})}
                className="mt-1.5 w-full px-3 py-2 text-[13px]" />
            </div>
            <div>
              <label className="eyebrow">Email *</label>
              <input required type="email" value={form.email} onChange={e => setForm({...form, email: e.target.value})}
                className="mt-1.5 w-full px-3 py-2 text-[13px]" />
            </div>
            <div>
              <label className="eyebrow">Password *</label>
              <input required type="password" minLength={6} value={form.password}
                onChange={e => setForm({...form, password: e.target.value})}
                className="mt-1.5 w-full px-3 py-2 text-[13px]" />
            </div>
            <div>
              <label className="eyebrow">Role</label>
              <select value={form.role} onChange={e => setForm({...form, role: e.target.value})}
                className="mt-1.5 w-full px-3 py-2 text-[13px]">
                <option value="WORKER">Worker</option>
                <option value="ADMIN">Admin</option>
              </select>
            </div>
            {error && (
              <p className="mono border-l-2 py-1 pl-3 text-[12px]" style={{ borderColor: "var(--rose)", color: "var(--rose)" }}>
                {error}
              </p>
            )}
            <div className="flex gap-2">
              <button type="submit" disabled={saving} className={buttonClass("primary")}>
                {saving ? "Saving…" : "Add member"}
              </button>
              <button type="button" onClick={() => setShowForm(false)} className={buttonClass("ghost")}>
                Cancel
              </button>
            </div>
          </form>
        </Plate>
      )}

      <Plate>
        {users.map((user) => (
          <div
            key={user.id}
            className="flex items-center justify-between gap-4 border-b border-line px-5 py-4 last:border-b-0"
          >
            <div className="flex items-center gap-3">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-navy-900 text-[11px] font-bold text-plate">
                {user.name.split(" ").map((n) => n[0]).slice(0, 2).join("").toUpperCase()}
              </span>
              <div>
                <p className="text-[15px] font-bold leading-tight text-ink">{user.name}</p>
                <p className="mono text-[12px] text-ink-3">{user.email}</p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <span
                className="eyebrow"
                style={{ color: user.role === "ADMIN" ? "var(--ink)" : "var(--ink-3)" }}
              >
                {user.role}
              </span>
              <button
                onClick={() => handleDelete(user.id)}
                className="text-ink-3 transition-colors hover:text-rose"
                aria-label="Remove member"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          </div>
        ))}
      </Plate>
    </div>
  );
}
