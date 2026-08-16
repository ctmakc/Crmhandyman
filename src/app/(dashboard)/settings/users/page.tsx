"use client";

import { useEffect, useState } from "react";
import { Check, Copy, Plus } from "lucide-react";
import {
  BackLink,
  Button,
  Chip,
  Empty,
  Skeleton,
  ErrorNote,
  Field,
  Lane,
  LaneHead,
  Num,
  PageHead,
  Stamp,
  buttonClass,
} from "@/components/ui/primitives";

/**
 * THE CREW — who can open this desk, and the two ways an owner grows the list.
 *
 * The top of the screen is the growth engine: the address the team signs in at, and a
 * panel that cuts an invite link. A NAMED invite carries one email and that person joins
 * ready to work; an OPEN link carries none and whoever follows it waits here for the
 * owner's yes. No email server is involved — the owner copies a link and sends it however
 * he likes. Below that the roster: who is waiting, and who is already on.
 */

interface Member {
  id: string;
  name: string;
  email: string;
  role: string;
  approved: boolean;
  createdAt: string;
}

interface Invite {
  id: string;
  token: string;
  role: string;
  email: string | null;
  maxUses: number | null;
  uses: number;
  expiresAt: string | null;
  createdAt: string;
  url: string;
  usable: boolean;
}

const initials = (name: string) =>
  name
    .split(" ")
    .map((n) => n[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

/** What a link's expiry says in one phrase. */
function expiryText(inv: Invite): string {
  if (!inv.expiresAt) return "no expiry";
  const when = new Date(inv.expiresAt).getTime();
  if (when <= Date.now()) return "expired";
  return `until ${new Intl.DateTimeFormat("en-CA", { month: "short", day: "numeric" }).format(when)}`;
}

/** Uses, in the fewest characters that stay true: `3 / 5`, or `3 joined` when unlimited. */
function usesText(inv: Invite): string {
  if (inv.maxUses !== null) return `${inv.uses} / ${inv.maxUses}`;
  return inv.uses === 1 ? "1 joined" : `${inv.uses} joined`;
}

export default function CrewPage() {
  const [members, setMembers] = useState<Member[]>([]);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [loading, setLoading] = useState(true);

  // The workspace's own address, read from the bar — in production this is
  // <slug>.agintent.com, which is exactly what a teammate types to sign in.
  const [host, setHost] = useState("");
  const [addrCopied, setAddrCopied] = useState(false);

  // The invite panel. Email blank = an open link; email set = a named invite. Max uses is
  // only meaningful for an open link, so it only shows there.
  const [invForm, setInvForm] = useState({ email: "", role: "WORKER", expiresInDays: "", maxUses: "" });
  const [invSaving, setInvSaving] = useState(false);
  const [invError, setInvError] = useState("");
  const [fresh, setFresh] = useState<(Invite & { url: string }) | null>(null);
  const [freshCopied, setFreshCopied] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  // The direct-add path — hand a teammate a password yourself, no link. Kept from before.
  const [showAdd, setShowAdd] = useState(false);
  const [addForm, setAddForm] = useState({ name: "", email: "", password: "", role: "WORKER" });
  const [addSaving, setAddSaving] = useState(false);
  const [addError, setAddError] = useState("");

  async function refresh() {
    const [u, i] = await Promise.all([
      fetch("/api/settings/users"),
      fetch("/api/invites"),
    ]);
    if (u.ok) setMembers(await u.json());
    if (i.ok) setInvites(await i.json());
    setLoading(false);
  }

  useEffect(() => {
    setHost(window.location.host);
    refresh();
  }, []);

  const crew = members.filter((m) => m.approved);
  const waiting = members.filter((m) => !m.approved);
  const openLink = invForm.email.trim() === "";

  async function copy(text: string, mark: () => void) {
    try {
      await navigator.clipboard.writeText(text);
      mark();
    } catch {
      /* clipboard blocked — the value stays selectable by hand in its field */
    }
  }

  async function createInvite(e: React.FormEvent) {
    e.preventDefault();
    setInvSaving(true);
    setInvError("");
    const res = await fetch("/api/invites", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: invForm.email.trim() || undefined,
        role: invForm.role,
        expiresInDays: invForm.expiresInDays || undefined,
        maxUses: openLink ? invForm.maxUses || undefined : undefined,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      setFresh(data);
      setFreshCopied(false);
      setInvForm({ email: "", role: "WORKER", expiresInDays: "", maxUses: "" });
      refresh();
    } else {
      setInvError(data.error || "That link was not created — check the details and try again.");
    }
    setInvSaving(false);
  }

  async function revokeInvite(id: string) {
    if (!confirm("Turn this invite off? The link stops working immediately.")) return;
    setBusyId(id);
    await fetch(`/api/invites/${id}`, { method: "DELETE" });
    if (fresh?.id === id) setFresh(null);
    await refresh();
    setBusyId(null);
  }

  async function approve(id: string) {
    setBusyId(id);
    await fetch("/api/settings/users", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    await refresh();
    setBusyId(null);
  }

  async function reject(m: Member) {
    if (!confirm(`Turn ${m.name} away? Their request is removed and they cannot open the desk.`)) return;
    setBusyId(m.id);
    await fetch(`/api/settings/users?id=${m.id}`, { method: "DELETE" });
    await refresh();
    setBusyId(null);
  }

  async function addDirect(e: React.FormEvent) {
    e.preventDefault();
    setAddSaving(true);
    setAddError("");
    const res = await fetch("/api/settings/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(addForm),
    });
    if (res.ok) {
      setShowAdd(false);
      setAddForm({ name: "", email: "", password: "", role: "WORKER" });
      refresh();
    } else {
      const data = await res.json().catch(() => ({}));
      setAddError(data.error || "That login was not created — check the email address and try again.");
    }
    setAddSaving(false);
  }

  async function removeMember(id: string) {
    if (!confirm("Remove this crew member? The login stops working immediately.")) return;
    await fetch(`/api/settings/users?id=${id}`, { method: "DELETE" });
    refresh();
  }

  return (
    <div className="page-doc space-y-10 pb-24 md:pb-0">
      <BackLink href="/settings" label="Settings" />

      <PageHead
        eyebrow="Desk setup · 02"
        title="Crew"
        sub="An admin sees the money, the settings and every job. A worker sees today's stops and the jobs he is on. Grow the crew with a link — no email setup needed."
      />

      {/* THE ADDRESS — where the team signs in. In production this is the workspace's own
          subdomain, so it is the one thing every teammate needs before a password. */}
      <section className="lane pt-4">
        <LaneHead title="Your workspace address" />
        <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center">
          <span className="mono t-record min-w-0 flex-1 truncate break-all bg-sunk px-4 py-3 font-bold text-ink">
            {host || "…"}
          </span>
          <button
            type="button"
            onClick={() => copy(host ? `https://${host}` : "", () => setAddrCopied(true))}
            className={`${buttonClass("ghost")} shrink-0`}
          >
            {addrCopied ? <Check className="h-4 w-4" aria-hidden /> : <Copy className="h-4 w-4" aria-hidden />}
            {addrCopied ? "Copied" : "Copy address"}
          </button>
        </div>
        <p className="measure t-meta mt-2 text-ink-2">
          Everyone on the crew signs in here. New teammates reach it through the invite link below.
        </p>
      </section>

      {/* THE INVITE ENGINE — one panel, two shapes. */}
      <section className="lane pt-4">
        <LaneHead title="Invite a teammate" />
        <form onSubmit={createInvite}>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <Field
              id="inv-email"
              label="Their email"
              hint={openLink ? "Blank = an open link anyone you send it to can use" : "They join ready to work — you vouched for this address"}
            >
              {(f) => (
                <input
                  {...f}
                  type="email"
                  value={invForm.email}
                  onChange={(e) => setInvForm({ ...invForm, email: e.target.value })}
                  placeholder="steve@yourshop.ca — or leave blank"
                  className={`${f.className} mono max-w-[320px]`}
                />
              )}
            </Field>
            <Field id="inv-role" label="Access">
              {(f) => (
                <select
                  {...f}
                  value={invForm.role}
                  onChange={(e) => setInvForm({ ...invForm, role: e.target.value })}
                  className={`${f.className} max-w-[240px]`}
                >
                  <option value="WORKER">Worker — today&apos;s stops</option>
                  <option value="ADMIN">Admin — the whole desk</option>
                </select>
              )}
            </Field>
            <Field id="inv-expiry" label="Link expires">
              {(f) => (
                <select
                  {...f}
                  value={invForm.expiresInDays}
                  onChange={(e) => setInvForm({ ...invForm, expiresInDays: e.target.value })}
                  className={`${f.className} max-w-[200px]`}
                >
                  <option value="">Never</option>
                  <option value="7">In 7 days</option>
                  <option value="30">In 30 days</option>
                  <option value="90">In 90 days</option>
                </select>
              )}
            </Field>
            {openLink && (
              <Field id="inv-max" label="Max people" hint="Blank = unlimited">
                {(f) => (
                  <input
                    {...f}
                    type="number"
                    min={1}
                    inputMode="numeric"
                    value={invForm.maxUses}
                    onChange={(e) => setInvForm({ ...invForm, maxUses: e.target.value })}
                    placeholder="Unlimited"
                    className={`${f.className} mono max-w-[160px]`}
                  />
                )}
              </Field>
            )}
          </div>

          {invError && <ErrorNote className="mt-4">{invError}</ErrorNote>}

          <div className="actions mt-4">
            <Button type="submit" disabled={invSaving}>
              {invSaving ? "Making link…" : openLink ? "Create open link" : "Create invite"}
            </Button>
          </div>
        </form>
      </section>

      {/* THE FRESH LINK — the loud, copy-me moment, held on screen until dismissed. Same
          band the intake key uses, because it is the same job: a string to copy and send. */}
      {fresh && (
        <section
          className="border-l-2 bg-sunk px-5 py-4"
          style={{ borderColor: "var(--amber)" }}
          role="status"
        >
          <div className="eyebrow" style={{ color: "var(--amber-ink)" }}>
            {fresh.email ? `Invite for ${fresh.email}` : "Open join link"} · share it however you like
          </div>

          <label className="sr-only" htmlFor="fresh-invite-url">
            Invite link
          </label>
          <textarea
            id="fresh-invite-url"
            readOnly
            rows={2}
            value={fresh.url}
            onFocus={(e) => e.currentTarget.select()}
            className="control mono mt-3 max-w-[560px] resize-none break-all bg-plate"
          />

          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <Button onClick={() => copy(fresh.url, () => setFreshCopied(true))}>
              {freshCopied ? <Check className="h-4 w-4" aria-hidden /> : <Copy className="h-4 w-4" aria-hidden />}
              {freshCopied ? "Copied" : "Copy link"}
            </Button>
            <Button variant="ghost" onClick={() => setFresh(null)}>
              Done
            </Button>
          </div>

          <p className="measure t-body mt-3 text-ink-2">
            {fresh.email
              ? "Text or email it to them. They set a password, and they can sign in with Google on this address afterward."
              : "Anyone who opens this link asks to join. You approve each one below before they can open the desk."}
          </p>
        </section>
      )}

      {/* ACTIVE INVITES — the outstanding links, each with its count and expiry. */}
      {invites.length > 0 && (
        <section>
          <LaneHead title="Open invites" count={invites.length} unit="invite" />
          <Lane>
            {invites.map((inv) => (
              <div key={inv.id} className="row">
                <div className="flex items-center gap-3 sm:gap-4">
                  <span className="min-w-0 flex-1">
                    <span className="t-row block truncate font-bold leading-tight text-ink">
                      {inv.email ?? "Open link"}
                    </span>
                    <span className="mono t-meta mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-ink-3">
                      <Num>{usesText(inv)}</Num>
                      <span aria-hidden>·</span>
                      <span style={{ color: inv.usable ? undefined : "var(--rose-ink)" }}>
                        {inv.usable ? expiryText(inv) : "spent"}
                      </span>
                    </span>
                  </span>
                  <Chip className="hidden sm:inline-flex">{inv.role}</Chip>
                  <button
                    type="button"
                    onClick={() => copy(inv.url, () => { setCopiedId(inv.id); setTimeout(() => setCopiedId((c) => (c === inv.id ? null : c)), 1500); })}
                    className={`${buttonClass("quiet")} shrink-0`}
                  >
                    {copiedId === inv.id ? "Copied" : "Copy"}
                  </button>
                  <button
                    type="button"
                    onClick={() => revokeInvite(inv.id)}
                    disabled={busyId === inv.id}
                    className={`${buttonClass("quiet")} shrink-0`}
                  >
                    Revoke
                  </button>
                </div>
              </div>
            ))}
          </Lane>
        </section>
      )}

      {/* WAITING TO JOIN — open-link joiners who need the owner's yes. Amber lamp: these
          are live requests sitting at the door. Only shown when there are any. */}
      {waiting.length > 0 && (
        <section>
          <LaneHead title="Waiting to join" lamp="var(--amber)" count={waiting.length} unit="request" />
          <Lane>
            {waiting.map((m) => (
              <div key={m.id} className="row" style={{ ["--spine" as string]: "var(--amber)" }}>
                <div className="flex items-center gap-3 sm:gap-4">
                  <span className="min-w-0 flex-1">
                    <span className="t-row block truncate font-bold leading-tight text-ink">{m.name}</span>
                    <span className="mono t-meta mt-1 block truncate text-ink-3">{m.email}</span>
                  </span>
                  <span className="eyebrow hidden shrink-0 sm:block" style={{ color: "var(--ink-3)" }}>
                    {m.role}
                  </span>
                  <Button
                    type="button"
                    onClick={() => approve(m.id)}
                    disabled={busyId === m.id}
                    className="shrink-0"
                  >
                    {busyId === m.id ? "…" : "Approve"}
                  </Button>
                  <button
                    type="button"
                    onClick={() => reject(m)}
                    disabled={busyId === m.id}
                    className={`${buttonClass("quiet")} shrink-0`}
                  >
                    Reject
                  </button>
                </div>
              </div>
            ))}
          </Lane>
        </section>
      )}

      {/* THE ROSTER — everyone who can open the desk today. */}
      <section>
        <LaneHead
          title="On the crew"
          count={crew.length}
          unit="person"
          right={
            <button type="button" onClick={() => setShowAdd((s) => !s)} className={buttonClass("quiet")}>
              <Plus className="h-3.5 w-3.5" aria-hidden /> Add with password
            </button>
          }
        />

        {showAdd && (
          <div className="pt-3">
            <form onSubmit={addDirect}>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field id="crew-name" label="Full name" required>
                  {(f) => (
                    <input
                      {...f}
                      value={addForm.name}
                      onChange={(e) => setAddForm({ ...addForm, name: e.target.value })}
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
                      value={addForm.email}
                      onChange={(e) => setAddForm({ ...addForm, email: e.target.value })}
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
                      value={addForm.password}
                      onChange={(e) => setAddForm({ ...addForm, password: e.target.value })}
                      className={`${f.className} max-w-[260px]`}
                    />
                  )}
                </Field>
                <Field id="crew-role" label="Access">
                  {(f) => (
                    <select
                      {...f}
                      value={addForm.role}
                      onChange={(e) => setAddForm({ ...addForm, role: e.target.value })}
                      className={`${f.className} max-w-[240px]`}
                    >
                      <option value="WORKER">Worker — today&apos;s stops</option>
                      <option value="ADMIN">Admin — the whole desk</option>
                    </select>
                  )}
                </Field>
              </div>

              {addError && <ErrorNote className="mt-4">{addError}</ErrorNote>}

              <div className="actions mt-4">
                <Button type="submit" disabled={addSaving}>
                  {addSaving ? "Saving…" : "Add crew member"}
                </Button>
                <Button type="button" variant="ghost" onClick={() => setShowAdd(false)}>
                  Cancel
                </Button>
              </div>
            </form>
          </div>
        )}

        <Lane className="mt-3">
          {loading && <Skeleton lines={3} />}

          {!loading && crew.length === 0 && (
            <Empty hint="Invite a teammate above, or add one directly with a password.">
              Only your login can open this desk
            </Empty>
          )}

          {/* No spine: an access level is not a status, and the word beside the name says
              it in full. `.row` is display:block, so the line is an inner flex. */}
          {crew.map((m) => (
            <div key={m.id} className="row">
              <div className="flex items-center gap-3 sm:gap-4">
                <span
                  className="mono flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-navy-900 t-micro font-bold text-plate"
                  aria-hidden
                >
                  {initials(m.name)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="t-row block truncate font-bold leading-tight text-ink">{m.name}</span>
                  <span className="mono t-meta mt-1 block truncate text-ink-3">{m.email}</span>
                </span>
                <span className="shrink-0 text-right">
                  <span
                    className="eyebrow block"
                    style={{ color: m.role === "ADMIN" ? "var(--ink)" : "var(--ink-3)" }}
                  >
                    {m.role}
                  </span>
                  <Stamp date={m.createdAt} className="t-micro mt-1 hidden text-ink-3 sm:block" />
                </span>
                <button
                  type="button"
                  onClick={() => removeMember(m.id)}
                  className={`${buttonClass("quiet")} shrink-0`}
                >
                  Remove
                </button>
              </div>
            </div>
          ))}
        </Lane>
      </section>
    </div>
  );
}
