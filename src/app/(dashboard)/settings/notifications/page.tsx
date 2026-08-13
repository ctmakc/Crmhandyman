"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Send } from "lucide-react";
import { PageHead, Plate, buttonClass } from "@/components/ui/primitives";
import { toast } from "@/components/ui/Toaster";

/**
 * LEAD ALERTS. The screen answers three questions in the order the owner asks them:
 * where do I hear about a lead, when do I NOT want to hear about it, and did the last
 * one actually arrive.
 *
 * The bot token is a credential: it is typed here, it is stored on the server and it
 * never comes back — the field shows a hint of what is saved and stays empty otherwise.
 */

type Settings = {
  isActive: boolean;
  email: string;
  telegramChatId: string;
  telegramTokenHint: string;
  quietFrom: string;
  quietTo: string;
  timezone: string;
  lastSentAt: string | null;
  lastResult: string;
  lastDelivered: boolean;
};

const EMPTY: Settings = {
  isActive: false,
  email: "",
  telegramChatId: "",
  telegramTokenHint: "",
  quietFrom: "",
  quietTo: "",
  timezone: "America/Toronto",
  lastSentAt: null,
  lastResult: "",
  lastDelivered: false,
};

const field = "mt-1.5 w-full px-3 py-2 text-[13px]";

function stamp(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso)
    .toLocaleString("en-CA", {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    })
    .replace(/,/g, "")
    .toUpperCase();
}

export default function NotificationsPage() {
  const [saved, setSaved] = useState<Settings>(EMPTY);
  const [form, setForm] = useState<Settings>(EMPTY);
  const [token, setToken] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [testResult, setTestResult] = useState("");

  useEffect(() => {
    fetch("/api/settings/notifications")
      .then((r) => r.json())
      .then((d: Settings) => {
        setSaved({ ...EMPTY, ...d });
        setForm({ ...EMPTY, ...d });
        setLoading(false);
      })
      .catch(() => {
        setError("Could not load your alert settings");
        setLoading(false);
      });
  }, []);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");

    const res = await fetch("/api/settings/notifications", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        isActive: form.isActive,
        email: form.email,
        telegramChatId: form.telegramChatId,
        // An untouched field keeps the stored token; the Forget button below clears it.
        ...(token.trim() ? { telegramToken: token.trim() } : {}),
        quietFrom: form.quietFrom,
        quietTo: form.quietTo,
        timezone: form.timezone,
      }),
    });

    if (res.ok) {
      const next: Settings = await res.json();
      setSaved(next);
      setForm(next);
      setToken("");
      toast("Alert settings saved");
    } else {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Could not save");
    }
    setBusy(false);
  }

  async function forgetToken() {
    if (!confirm("Forget the bot token? Telegram alerts stop until a new one is saved.")) return;
    setBusy(true);
    const res = await fetch("/api/settings/notifications", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ telegramToken: null }),
    });
    if (res.ok) {
      const next: Settings = await res.json();
      setSaved(next);
      setForm((f) => ({ ...f, telegramTokenHint: next.telegramTokenHint }));
      toast("Bot token forgotten");
    }
    setBusy(false);
  }

  async function sendTest() {
    setBusy(true);
    setTestResult("");
    const res = await fetch("/api/settings/notifications", { method: "POST" });
    const data = await res.json().catch(() => ({ ok: false, detail: "no answer" }));
    setTestResult(`${data.ok ? "SENT" : "FAILED"} · ${data.detail}`);
    setBusy(false);
  }

  const set = (k: keyof Settings) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm({ ...form, [k]: e.target.value });

  return (
    <div className="max-w-2xl space-y-6 pb-24 md:pb-0">
      <Link href="/settings" className="eyebrow inline-flex items-center gap-1.5 hover:text-ink">
        <ArrowLeft className="h-3.5 w-3.5" /> Settings
      </Link>

      <PageHead
        eyebrow="Desk setup · 06"
        title="Lead alerts"
        sub="The shop that calls back first gets the job. This is how a new lead reaches you without anyone watching the screen."
      />

      {loading ? (
        <Plate className="p-5">
          <div className="eyebrow">Loading…</div>
        </Plate>
      ) : (
        <>
          {/* THE LAST WORD — what actually happened to the last alert. Rose when the
              channel refused it, because a broken bot reads as silence otherwise. */}
          {saved.lastSentAt && (
            <div
              className="border-l-2 bg-sunk px-5 py-3"
              style={{ borderColor: saved.lastDelivered ? "var(--emerald)" : "var(--rose)" }}
            >
              <div className="eyebrow">Last alert</div>
              <p className="mono mt-1.5 text-[12px] text-ink">
                {stamp(saved.lastSentAt)} · {saved.lastResult || "delivered"}
              </p>
            </div>
          )}

          <Plate className="p-5">
            <form onSubmit={save} className="space-y-6">
              <label className="flex items-center gap-2 text-[13px] text-ink">
                <input
                  type="checkbox"
                  checked={form.isActive}
                  onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
                  className="h-3.5 w-3.5"
                />
                Alert me the moment a lead lands
              </label>

              {/* TELEGRAM — the channel that actually wakes a phone. */}
              <div className="border-t border-line pt-5">
                <div className="eyebrow">Telegram</div>
                <p className="mt-1.5 text-[12px] text-ink-2">
                  Your own bot, not ours. In Telegram open{" "}
                  <span className="mono text-[12px]">@BotFather</span>, send{" "}
                  <span className="mono text-[12px]">/newbot</span>, paste the token below.
                  Then write one message to your new bot and open{" "}
                  <span className="mono text-[12px]">
                    api.telegram.org/bot&lt;token&gt;/getUpdates
                  </span>{" "}
                  to read your chat id.
                </p>

                <div className="mt-4">
                  <label className="eyebrow">Bot token</label>
                  <input
                    type="password"
                    autoComplete="off"
                    value={token}
                    onChange={(e) => setToken(e.target.value)}
                    placeholder={
                      saved.telegramTokenHint
                        ? `saved · ${saved.telegramTokenHint}`
                        : "123456789:AAF…"
                    }
                    className={`${field} mono`}
                  />
                  <p className="mt-1.5 flex items-center gap-3 text-[12px] text-ink-2">
                    <span>The token stays on the server and is never shown again.</span>
                    {saved.telegramTokenHint && (
                      <button
                        type="button"
                        onClick={forgetToken}
                        className="eyebrow hover:text-rose"
                      >
                        Forget it
                      </button>
                    )}
                  </p>
                </div>

                <div className="mt-4">
                  <label className="eyebrow">Chat id</label>
                  <input
                    value={form.telegramChatId}
                    onChange={set("telegramChatId")}
                    placeholder="123456789"
                    className={`${field} mono`}
                  />
                </div>
              </div>

              {/* EMAIL — the fallback that needs no setup. */}
              <div className="border-t border-line pt-5">
                <div className="eyebrow">Email</div>
                <input
                  type="email"
                  value={form.email}
                  onChange={set("email")}
                  placeholder="dispatch@yourshop.ca"
                  className={field}
                />
                <p className="mt-1.5 text-[12px] text-ink-2">
                  Left empty, alerts go to the workspace owner&apos;s address.
                </p>
              </div>

              {/* QUIET HOURS — a mover at 23:40 does not want a call from a robot. */}
              <div className="border-t border-line pt-5">
                <div className="eyebrow">Quiet hours</div>
                <p className="mt-1.5 text-[12px] text-ink-2">
                  Leads that arrive inside this window wait and arrive together in one
                  message when it ends. Leave both blank to be told at any hour.
                </p>
                <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
                  <div>
                    <label className="eyebrow">From</label>
                    <input
                      type="time"
                      value={form.quietFrom}
                      onChange={set("quietFrom")}
                      className={`${field} mono`}
                    />
                  </div>
                  <div>
                    <label className="eyebrow">Until</label>
                    <input
                      type="time"
                      value={form.quietTo}
                      onChange={set("quietTo")}
                      className={`${field} mono`}
                    />
                  </div>
                  <div>
                    <label className="eyebrow">Time zone</label>
                    <input
                      value={form.timezone}
                      onChange={set("timezone")}
                      placeholder="America/Toronto"
                      className={`${field} mono`}
                    />
                  </div>
                </div>
              </div>

              {error && (
                <p
                  className="mono border-l-2 py-1 pl-3 text-[12px]"
                  style={{ borderColor: "var(--rose)", color: "var(--rose-ink)" }}
                >
                  {error}
                </p>
              )}

              <div className="flex flex-wrap items-center gap-2 border-t border-line pt-5">
                <button type="submit" disabled={busy} className={buttonClass("primary")}>
                  {busy ? "Saving…" : "Save"}
                </button>
                <button
                  type="button"
                  onClick={sendTest}
                  disabled={busy}
                  className={buttonClass("ghost")}
                >
                  <Send className="h-3.5 w-3.5" /> Send a test
                </button>
              </div>

              {testResult && (
                <p
                  className="mono text-[12px]"
                  style={{
                    color: testResult.startsWith("SENT")
                      ? "var(--emerald-ink)"
                      : "var(--rose-ink)",
                  }}
                >
                  {testResult}
                </p>
              )}
            </form>
          </Plate>

          <p className="text-[12px] text-ink-2">
            A failed alert never costs you the lead — it is on the sheet either way, and
            every attempt is written into the action log.
          </p>
        </>
      )}
    </div>
  );
}
