"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import { PageHead, Plate, buttonClass } from "@/components/ui/primitives";
import { toast } from "@/components/ui/Toaster";

/**
 * Your own account. Deliberately outside /settings, which is the owner's desk — the
 * crew has to be able to change the password they were handed on day one too.
 */
export default function AccountPage() {
  const { data: session } = useSession();
  const [form, setForm] = useState({ currentPassword: "", newPassword: "", confirm: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (form.newPassword !== form.confirm) {
      setError("The two new passwords do not match");
      return;
    }

    setSaving(true);
    const res = await fetch("/api/account/password", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        currentPassword: form.currentPassword,
        newPassword: form.newPassword,
      }),
    });
    setSaving(false);

    if (res.ok) {
      setForm({ currentPassword: "", newPassword: "", confirm: "" });
      toast("Password changed");
      return;
    }
    const data = await res.json().catch(() => ({}));
    setError(data.error || "Could not change the password");
  }

  const field = "mt-1.5 w-full px-3 py-2 text-[13px]";

  return (
    <div className="max-w-2xl space-y-6 pb-24 md:pb-0">
      <PageHead eyebrow="Your account" title="Account" />

      <div className="border border-line bg-plate">
        <div className="flex items-baseline gap-5 border-b border-line px-5 py-5">
          <span className="mono text-[12px] tracking-[0.1em] text-ink-3">01</span>
          <span className="flex-1">
            <span className="block text-[17px] font-bold leading-none text-ink">
              {session?.user?.name || "Signed in"}
            </span>
            <span className="mono mt-1.5 block text-[13px] text-ink-2">
              {session?.user?.email}
            </span>
          </span>
        </div>
      </div>

      <Plate className="p-5">
        <div className="eyebrow">Change password</div>
        <p className="mt-1.5 text-[13px] text-ink-2">
          The password you were given when this desk was set up is known to whoever set it
          up. Ten characters minimum.
        </p>

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <div>
            <label className="eyebrow">Current password *</label>
            <input
              required
              type="password"
              autoComplete="current-password"
              value={form.currentPassword}
              onChange={(e) => setForm({ ...form, currentPassword: e.target.value })}
              className={field}
            />
          </div>
          <div>
            <label className="eyebrow">New password *</label>
            <input
              required
              type="password"
              minLength={10}
              autoComplete="new-password"
              value={form.newPassword}
              onChange={(e) => setForm({ ...form, newPassword: e.target.value })}
              className={field}
            />
          </div>
          <div>
            <label className="eyebrow">Repeat new password *</label>
            <input
              required
              type="password"
              minLength={10}
              autoComplete="new-password"
              value={form.confirm}
              onChange={(e) => setForm({ ...form, confirm: e.target.value })}
              className={field}
            />
          </div>

          {error && (
            <p
              className="mono border-l-2 py-1 pl-3 text-[12px]"
              style={{ borderColor: "var(--rose)", color: "var(--rose-ink)" }}
            >
              {error}
            </p>
          )}

          <button type="submit" disabled={saving} className={buttonClass("primary")}>
            {saving ? "Saving…" : "Change password"}
          </button>
        </form>
      </Plate>
    </div>
  );
}
