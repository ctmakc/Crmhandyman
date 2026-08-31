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
  PageHead,
  buttonClass,
} from "@/components/ui/primitives";

interface IntakeKey {
  id: string;
  label: string;
  source: string;
  isActive: boolean;
  lastUsedAt: string | null;
  createdAt: string;
}

/** Shown once, right after creation — the server keeps only the digest. */
interface FreshKey extends IntakeKey {
  key: string;
  path: string;
}

const SOURCES = [
  "WEBSITE",
  "FACEBOOK",
  "INSTAGRAM",
  "GOOGLE",
  "GOOGLE_LSA",
  "HOMESTARS",
  "BARK",
  "URBANTASKER",
  "MOVINGWALDO",
  "KIJIJI",
  "EMAIL",
  "OTHER",
];

/** The owner's real question here is «is this channel still alive». */
function whenText(value: string | null): string {
  if (!value) return "no leads yet";
  const days = Math.floor((Date.now() - new Date(value).getTime()) / 86_400_000);
  if (days === 0) return "last lead today";
  if (days === 1) return "last lead yesterday";
  return `last lead ${days} days ago`;
}

export default function IntakePage() {
  const [keys, setKeys] = useState<IntakeKey[]>([]);
  const [origin, setOrigin] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ label: "", source: "WEBSITE" });
  const [fresh, setFresh] = useState<FreshKey | null>(null);
  const [copied, setCopied] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function fetchKeys() {
    const res = await fetch("/api/settings/intake-keys");
    if (res.ok) setKeys(await res.json());
    setLoading(false);
  }

  useEffect(() => {
    setOrigin(window.location.origin);
    fetchKeys();
  }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    const res = await fetch("/api/settings/intake-keys", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    if (res.ok) {
      setFresh(await res.json());
      setShowForm(false);
      setForm({ label: "", source: "WEBSITE" });
      setCopied(false);
      fetchKeys();
    } else {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "That key was not created. Give the channel a name and try again.");
    }
    setSaving(false);
  }

  async function handleDelete(id: string, label: string) {
    if (!confirm(`Revoke the key for «${label}»? That landing page stops delivering leads immediately.`))
      return;
    await fetch(`/api/settings/intake-keys?id=${id}`, { method: "DELETE" });
    fetchKeys();
  }

  async function copyUrl(url: string) {
    await navigator.clipboard.writeText(url);
    setCopied(true);
  }

  const freshUrl = fresh ? `${origin}${fresh.path}` : "";

  return (
    <div className="page-doc space-y-6 pb-24 md:pb-0">
      <BackLink href="/settings" label="Settings" />

      <PageHead
        eyebrow="Desk setup · 04"
        title="Landing intake"
        sub="A quiz on your own site posts straight onto the call sheet. One key per landing page."
        action={
          <Button onClick={() => setShowForm(true)}>
            <Plus className="h-4 w-4" aria-hidden /> New key
          </Button>
        }
      />

      {showForm && (
        <section className="lane pt-4">
          <LaneHead title="New intake key" />
          <form onSubmit={handleCreate}>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <Field
                id="key-label"
                label="Channel name"
                required
                hint="What you will recognise in six months — the page it lives on."
              >
                {(f) => (
                  <input
                    {...f}
                    value={form.label}
                    onChange={(e) => setForm({ ...form, label: e.target.value })}
                    placeholder="Moving quote — beavermovers.com"
                    className={`${f.className} max-w-[320px]`}
                  />
                )}
              </Field>
              <Field id="key-source" label="Counts as source">
                {(f) => (
                  <select
                    {...f}
                    value={form.source}
                    onChange={(e) => setForm({ ...form, source: e.target.value })}
                    className={`${f.className} mono max-w-[220px]`}
                  >
                    {SOURCES.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                )}
              </Field>
            </div>

            {error && <ErrorNote className="mt-4">{error}</ErrorNote>}

            <div className="actions mt-4">
              <Button type="submit" disabled={saving}>
                {saving ? "Creating…" : "Create key"}
              </Button>
              <Button type="button" variant="ghost" onClick={() => setShowForm(false)}>
                Cancel
              </Button>
            </div>
          </form>
        </section>
      )}

      {/* THE ONE MOMENT THE KEY IS READABLE.
          The band stays on the screen until the owner says he has it: the copy button
          is the loud one, the URL sits in a field he can select by hand on a phone,
          and the line under it names what a lost key costs. */}
      {fresh && (
        <section
          className="border-l-2 bg-sunk px-5 py-4"
          style={{ borderColor: "var(--amber)" }}
          role="status"
        >
          <div className="eyebrow" style={{ color: "var(--amber-ink)" }}>
            Copy this address now — it is shown once
          </div>

          <label className="sr-only" htmlFor="fresh-key-url">
            Intake address for {fresh.label}
          </label>
          <textarea
            id="fresh-key-url"
            readOnly
            rows={2}
            value={freshUrl}
            onFocus={(e) => e.currentTarget.select()}
            className="control mono mt-3 max-w-[560px] resize-none break-all bg-plate"
          />

          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <Button onClick={() => copyUrl(freshUrl)}>
              {copied ? <Check className="h-4 w-4" aria-hidden /> : <Copy className="h-4 w-4" aria-hidden />}
              {copied ? "Copied" : "Copy address"}
            </Button>
            <Button variant="ghost" onClick={() => setFresh(null)}>
              I have saved it
            </Button>
          </div>

          <p className="measure t-body mt-3 text-ink-2">
            {copied
              ? "It is on the clipboard. Paste it into the form handler on the landing page before you leave this screen."
              : "Paste it into the form handler on your landing page. Whoever built the page needs this address and nothing else."}{" "}
            <span className="text-ink">
              Leaving this screen closes the only view of the key — a lost one means creating
              another and editing the landing page again.
            </span>
          </p>
        </section>
      )}

      <Lane>
        {loading && <Skeleton lines={2} />}

        {!loading && keys.length === 0 && (
          <Empty
            hint="Wire a form on your own site to this desk and its leads land on the call sheet with the rest."
            action={
              <Button onClick={() => setShowForm(true)}>
                <Plus className="h-4 w-4" aria-hidden /> New key
              </Button>
            }
          >
            No landing page is wired up yet
          </Empty>
        )}

        {keys.map((key) => (
          <div key={key.id} className="row">
            <div className="flex items-center gap-3 sm:gap-4">
              <span className="min-w-0 flex-1">
                <span className="t-row block truncate font-bold leading-tight text-ink">
                  {key.label}
                </span>
                <span className="mono t-meta mt-1.5 block text-ink-3">{whenText(key.lastUsedAt)}</span>
              </span>
              <Chip className="hidden sm:inline-flex">{key.source}</Chip>
              <button
                type="button"
                onClick={() => handleDelete(key.id, key.label)}
                className={`${buttonClass("quiet")} shrink-0`}
              >
                Revoke
              </button>
            </div>
          </div>
        ))}
      </Lane>
    </div>
  );
}
