"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import {
  Button,
  ErrorNote,
  Field,
  Lane,
  LaneHead,
  PageHead,
} from "@/components/ui/primitives";
import { toast } from "@/components/ui/Toaster";

/**
 * Your own account. Deliberately outside /settings, which is the owner's desk — the
 * crew has to be able to change the password they were handed on day one too.
 *
 * The identity block used to carry a mono «01» borrowed from the settings index, which
 * numbered a man like a section. It carries what he actually needs to know instead:
 * which workspace this login opens and how much of it he sees.
 */
export default function AccountPage() {
  const { data: session } = useSession();
  const [form, setForm] = useState({ currentPassword: "", newPassword: "", confirm: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const user = (session?.user || {}) as any;
  const name: string = user.name || "Signed in";
  const role: string = user.role || "";
  const workspace: string = user.tenantSlug || "";
  const initials = name
    .split(" ")
    .map((n: string) => n[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (form.newPassword !== form.confirm) {
      setError("The two new passwords do not match — type the new one again in both boxes.");
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
    setError(data.error || "The password did not change. Check the current one and try again.");
  }

  return (
    <div className="page-doc space-y-6 pb-24 md:pb-0">
      <PageHead
        eyebrow="Your account"
        title="Account"
        sub="This login and its password. Everything else about the desk lives in Settings."
      />

      <Lane>
        {/* No spine: a person is not a status. `.row` is display:block, so the line
            lives on an inner flex element. */}
        <div className="row">
          <div className="flex items-center gap-3 sm:gap-4">
          <span
            className="mono flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-navy-900 t-meta font-bold text-plate"
            aria-hidden
          >
            {initials}
          </span>
          <span className="min-w-0 flex-1">
            <span className="t-row block truncate font-bold leading-tight text-ink">{name}</span>
            <span className="mono t-meta mt-1 block truncate text-ink-3">{user.email}</span>
            {/* Access and workspace read as one detail line under the name. Pinned to
                the far right of a 980px row they hung on their own in open deck. */}
            {(role || workspace) && (
              <span className="eyebrow mt-2 block">
                {role && <span className="text-ink">{role}</span>}
                {role && workspace && " · "}
                {workspace && <span>Workspace {workspace}</span>}
              </span>
            )}
          </span>
          </div>
        </div>
      </Lane>

      <section className="lane mt-10 pt-4">
        <LaneHead title="Change password" />
        <p className="measure t-body mt-4 text-ink-2">
          The password you were handed when this desk was set up is known to whoever set it up.
          Ten characters minimum.
        </p>

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <Field id="pw-current" label="Current password" required>
            {(f) => (
              <input
                {...f}
                type="password"
                autoComplete="current-password"
                value={form.currentPassword}
                onChange={(e) => setForm({ ...form, currentPassword: e.target.value })}
                className={`${f.className} max-w-[300px]`}
              />
            )}
          </Field>
          <Field id="pw-new" label="New password" required>
            {(f) => (
              <input
                {...f}
                type="password"
                minLength={10}
                autoComplete="new-password"
                value={form.newPassword}
                onChange={(e) => setForm({ ...form, newPassword: e.target.value })}
                className={`${f.className} max-w-[300px]`}
              />
            )}
          </Field>
          <Field id="pw-repeat" label="Repeat new password" required>
            {(f) => (
              <input
                {...f}
                type="password"
                minLength={10}
                autoComplete="new-password"
                value={form.confirm}
                onChange={(e) => setForm({ ...form, confirm: e.target.value })}
                className={`${f.className} max-w-[300px]`}
              />
            )}
          </Field>

          {error && <ErrorNote>{error}</ErrorNote>}

          <div className="actions">
            <Button type="submit" disabled={saving}>
              {saving ? "Saving…" : "Change password"}
            </Button>
          </div>
        </form>
      </section>
    </div>
  );
}
