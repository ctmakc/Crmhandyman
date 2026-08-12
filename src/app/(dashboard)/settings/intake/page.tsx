"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Check, Copy, Plus, Trash2 } from "lucide-react";
import { PageHead, Plate, buttonClass } from "@/components/ui/primitives";

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

const SOURCES = ["OTHER", "FACEBOOK", "INSTAGRAM", "GOOGLE", "HOMESTARS", "KIJIJI", "EMAIL"];

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
  const [form, setForm] = useState({ label: "", source: "OTHER" });
  const [fresh, setFresh] = useState<FreshKey | null>(null);
  const [copied, setCopied] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function fetchKeys() {
    const res = await fetch("/api/settings/intake-keys");
    if (res.ok) setKeys(await res.json());
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
      setForm({ label: "", source: "OTHER" });
      setCopied(false);
      fetchKeys();
    } else {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Could not create the key");
    }
    setSaving(false);
  }

  async function handleDelete(id: string) {
    if (!confirm("Revoke this key? The landing page stops delivering leads immediately.")) return;
    await fetch(`/api/settings/intake-keys?id=${id}`, { method: "DELETE" });
    fetchKeys();
  }

  async function copyUrl(url: string) {
    await navigator.clipboard.writeText(url);
    setCopied(true);
  }

  return (
    <div className="max-w-2xl space-y-6 pb-24 md:pb-0">
      <Link href="/settings" className="eyebrow inline-flex items-center gap-1.5 hover:text-ink">
        <ArrowLeft className="h-3.5 w-3.5" /> Settings
      </Link>

      <PageHead
        eyebrow="Desk setup · 03"
        title="Landing intake"
        sub="A quiz on your own site posts straight into this desk. One key per landing page."
        action={
          <button onClick={() => setShowForm(true)} className={buttonClass("primary")}>
            <Plus className="h-4 w-4" /> New key
          </button>
        }
      />

      {showForm && (
        <Plate className="p-5">
          <div className="eyebrow">New intake key</div>
          <form onSubmit={handleCreate} className="mt-4 space-y-4">
            <div>
              <label className="eyebrow">Channel name *</label>
              <input
                required
                value={form.label}
                onChange={(e) => setForm({ ...form, label: e.target.value })}
                placeholder="Korvex renovation quiz"
                className="mt-1.5 w-full px-3 py-2 text-[13px]"
              />
            </div>
            <div>
              <label className="eyebrow">Counts as source</label>
              <select
                value={form.source}
                onChange={(e) => setForm({ ...form, source: e.target.value })}
                className="mt-1.5 w-full px-3 py-2 text-[13px]"
              >
                {SOURCES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
            {error && (
              <p
                className="mono border-l-2 py-1 pl-3 text-[12px]"
                style={{ borderColor: "var(--rose)", color: "var(--rose-ink)" }}
              >
                {error}
              </p>
            )}
            <div className="flex gap-2">
              <button type="submit" disabled={saving} className={buttonClass("primary")}>
                {saving ? "Creating…" : "Create key"}
              </button>
              <button type="button" onClick={() => setShowForm(false)} className={buttonClass("ghost")}>
                Cancel
              </button>
            </div>
          </form>
        </Plate>
      )}

      {/* The one moment the key is readable. Recessed lane, mono, copy in one tap. */}
      {fresh && (
        <div className="border-l-2 bg-sunk px-5 py-4" style={{ borderColor: "var(--amber)" }}>
          <div className="eyebrow" style={{ color: "var(--amber-ink)" }}>
            Copy this URL now — it is shown once
          </div>
          <p className="mono mt-2.5 break-all text-[12px] text-ink">
            {origin}
            {fresh.path}
          </p>
          <div className="mt-3 flex items-center gap-3">
            <button
              onClick={() => copyUrl(`${origin}${fresh.path}`)}
              className={buttonClass("ghost")}
            >
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              {copied ? "Copied" : "Copy URL"}
            </button>
            <button onClick={() => setFresh(null)} className="eyebrow hover:text-ink">
              Hide
            </button>
          </div>
          <p className="mt-3 text-[13px] text-ink-2">
            Paste it into <span className="mono text-[12px]">send_lead.php</span> on the landing
            page. Setup steps live in <span className="mono text-[12px]">docs/INTAKE.md</span>.
          </p>
        </div>
      )}

      <Plate>
        {keys.length === 0 && (
          <p className="px-5 py-9 text-center">
            <span className="eyebrow">No landing page is wired up yet</span>
          </p>
        )}
        {keys.map((key) => (
          <div
            key={key.id}
            className="flex items-center justify-between gap-4 border-b border-line px-5 py-4 last:border-b-0"
          >
            <div>
              <p className="text-[15px] font-bold leading-tight text-ink">{key.label}</p>
              <p className="mono mt-1 text-[12px] text-ink-3">
                {key.source} · {whenText(key.lastUsedAt)}
              </p>
            </div>
            <button
              onClick={() => handleDelete(key.id)}
              className="text-ink-3 transition-colors hover:text-rose"
              aria-label="Revoke key"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ))}
      </Plate>
    </div>
  );
}
