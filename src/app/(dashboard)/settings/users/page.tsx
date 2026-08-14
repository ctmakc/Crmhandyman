"use client";

import { useEffect, useState } from "react";
import { Plus } from "lucide-react";
import {
  BackLink,
  Button,
  Empty,
  Skeleton,
  ErrorNote,
  Field,
  Lane,
  LaneHead,
  PageHead,
  Stamp,
  buttonClass,
} from "@/components/ui/primitives";

/**
 * THE TEAM — one line per person who can open this desk, with the one fact that
 * matters beside the name: how much of the desk that login sees.
 */

interface User {
  id: string;
  name: string;
  email: string;
  role: string;
  createdAt: string;
}

const initials = (name: string) =>
  name
    .split(" ")
    .map((n) => n[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

export default function UsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", password: "", role: "WORKER" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function fetchUsers() {
    const res = await fetch("/api/settings/users");
    setUsers(await res.json());
    setLoading(false);
  }

  useEffect(() => {
    fetchUsers();
  }, []);

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
      setError(data.error || "That login was not created — check the email address and try again.");
    }
    setSaving(false);
  }

  async function handleDelete(id: string) {
    if (!confirm("Remove this crew member? The login stops working immediately.")) return;
    await fetch(`/api/settings/users?id=${id}`, { method: "DELETE" });
    fetchUsers();
  }

  return (
    <div className="page-doc space-y-6 pb-24 md:pb-0">
      <BackLink href="/settings" label="Settings" />

      <PageHead
        eyebrow="Desk setup · 02"
        title="Crew"
        sub="An admin sees the money, the settings and every job. A worker sees today's stops and the jobs he is on."
        action={
          <Button onClick={() => setShowForm(true)}>
            <Plus className="h-4 w-4" aria-hidden /> Add crew
          </Button>
        }
      />

      {showForm && (
        <section className="lane pt-4">
          <LaneHead title="New crew member" />
          <form onSubmit={handleAdd}>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <Field id="crew-name" label="Full name" required>
                {(f) => (
                  <input
                    {...f}
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    placeholder="Steve Brown"
                    className={`${f.className} max-w-[320px]`}
                  />
                )}
              </Field>
              <Field id="crew-email" label="Email" required>
                {(f) => (
                  <input
                    {...f}
                    type="email"
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                    placeholder="steve@yourshop.ca"
                    className={`${f.className} mono max-w-[320px]`}
                  />
                )}
              </Field>
              <Field
                id="crew-password"
                label="Password"
                required
                hint="Hand it to him once. He changes it on his own account page."
              >
                {(f) => (
                  <input
                    {...f}
                    type="password"
                    minLength={6}
                    autoComplete="new-password"
                    value={form.password}
                    onChange={(e) => setForm({ ...form, password: e.target.value })}
                    className={`${f.className} max-w-[260px]`}
                  />
                )}
              </Field>
              <Field id="crew-role" label="Access">
                {(f) => (
                  <select
                    {...f}
                    value={form.role}
                    onChange={(e) => setForm({ ...form, role: e.target.value })}
                    className={`${f.className} max-w-[220px]`}
                  >
                    <option value="WORKER">Worker — today&apos;s stops</option>
                    <option value="ADMIN">Admin — the whole desk</option>
                  </select>
                )}
              </Field>
            </div>

            {error && <ErrorNote className="mt-4">{error}</ErrorNote>}

            <div className="actions mt-4">
              <Button type="submit" disabled={saving}>
                {saving ? "Saving…" : "Add crew member"}
              </Button>
              <Button type="button" variant="ghost" onClick={() => setShowForm(false)}>
                Cancel
              </Button>
            </div>
          </form>
        </section>
      )}

      <Lane>
        {loading && <Skeleton lines={3} />}

        {!loading && users.length === 0 && (
          <Empty
            hint="Nobody else can open this desk yet. Add a crew member and hand him the password once."
            action={
              <Button onClick={() => setShowForm(true)}>
                <Plus className="h-4 w-4" aria-hidden /> Add crew
              </Button>
            }
          >
            No logins besides yours
          </Empty>
        )}

        {/* No spine: an access level is not a status, and the word beside the name
            says it in full. `.row` is display:block, so the line is an inner flex. */}
        {users.map((user) => (
          <div key={user.id} className="row">
            <div className="flex items-center gap-3 sm:gap-4">
            <span
              className="mono flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-navy-900 t-micro font-bold text-plate"
              aria-hidden
            >
              {initials(user.name)}
            </span>
            <span className="min-w-0 flex-1">
              <span className="t-row block truncate font-bold leading-tight text-ink">
                {user.name}
              </span>
              <span className="mono t-meta mt-1 block truncate text-ink-3">{user.email}</span>
            </span>
            <span className="shrink-0 text-right">
              <span
                className="eyebrow block"
                style={{ color: user.role === "ADMIN" ? "var(--ink)" : "var(--ink-3)" }}
              >
                {user.role}
              </span>
              <Stamp date={user.createdAt} className="t-micro mt-1 hidden text-ink-3 sm:block" />
            </span>
            <button
              type="button"
              onClick={() => handleDelete(user.id)}
              className={`${buttonClass("quiet")} shrink-0`}
            >
              Remove
            </button>
            </div>
          </div>
        ))}
      </Lane>
    </div>
  );
}
