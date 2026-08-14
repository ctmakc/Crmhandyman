"use client";

import { useEffect, useState } from "react";
import { Send } from "lucide-react";
import {
  BackLink,
  Button,
  ErrorNote,
  Field,
  LaneHead,
  PageHead,
  Skeleton,
  Stamp,
} from "@/components/ui/primitives";
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

/**
 * What the test button prints. The server answers with a machine detail
 * («nothing is configured yet», an SMTP refusal quoted verbatim); the screen puts a
 * sentence in front of it that says what happened and what to do about it, and keeps
 * the detail underneath because that line is what gets read down the phone to support.
 */
type TestOutcome = { ok: boolean; headline: string; detail: string } | null;

export default function NotificationsPage() {
  const [saved, setSaved] = useState<Settings>(EMPTY);
  const [form, setForm] = useState<Settings>(EMPTY);
  const [token, setToken] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [test, setTest] = useState<TestOutcome>(null);

  useEffect(() => {
    fetch("/api/settings/notifications")
      .then((r) => r.json())
      .then((d: Settings) => {
        setSaved({ ...EMPTY, ...d });
        setForm({ ...EMPTY, ...d });
        setLoading(false);
      })
      .catch(() => {
        setError("Your alert settings did not load — check the connection and open this page again.");
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
      setError(data.error || "The settings did not save. Try again in a moment.");
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
    setTest(null);
    const res = await fetch("/api/settings/notifications", { method: "POST" });
    const data = await res
      .json()
      .catch(() => ({ ok: false, detail: "the desk gave no answer" }));
    const detail = String(data.detail || "");
    setTest({
      ok: !!data.ok,
      headline: data.ok
        ? "Test alert sent. It lands on the phone within a few seconds. If nothing arrives, the chat id points at another chat."
        : /nothing is configured/i.test(detail)
          ? "No channel is set up yet. Save a Telegram chat id or an email address above, then send the test again."
          : "The channel refused the test alert. The refusal it gave is below, word for word.",
      detail,
    });
    setBusy(false);
  }

  const set = (k: keyof Settings) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm({ ...form, [k]: e.target.value });

  return (
    <div className="page-doc space-y-6 pb-24 md:pb-0">
      <BackLink href="/settings" label="Settings" />

      <PageHead
        eyebrow="Desk setup · 05"
        title="Lead alerts"
        sub="The shop that calls back first gets the job. This is how a new lead reaches you without anyone watching the screen."
      />

      {loading ? (
        <Skeleton lines={3} />
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
              <p className="t-body mt-1.5 text-ink">
                <Stamp date={saved.lastSentAt} withTime />{" "}
                <span className="text-ink-2">·</span>{" "}
                {saved.lastResult || (saved.lastDelivered ? "delivered" : "no answer")}
              </p>
            </div>
          )}

          <form onSubmit={save}>
            <section className="lane pt-4">
              <LaneHead title="Alerts" />
              <label className="t-body mt-4 flex items-center gap-2.5 text-ink">
                <input
                  type="checkbox"
                  checked={form.isActive}
                  onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
                  className="h-4 w-4"
                />
                Alert me the moment a lead lands
              </label>
            </section>

            {/* TELEGRAM — the channel that actually wakes a phone. */}
            <section className="lane mt-10 pt-4">
              <LaneHead title="Telegram" />
              <p className="measure t-body mt-4 text-ink-2">
                Your own bot. In Telegram open <span className="mono">@BotFather</span>, send{" "}
                <span className="mono">/newbot</span> and paste the token it gives you below.
                Then write one message to your new bot and open{" "}
                <span className="mono">api.telegram.org/bot&lt;token&gt;/getUpdates</span> to read
                your chat id.
              </p>

              <Field
                id="tg-token"
                label="Bot token"
                className="mt-4"
                hint="The token stays on the server and is never shown again."
              >
                {(f) => (
                  <input
                    {...f}
                    type="password"
                    autoComplete="off"
                    value={token}
                    onChange={(e) => setToken(e.target.value)}
                    placeholder={
                      saved.telegramTokenHint ? `saved · ${saved.telegramTokenHint}` : "123456789:AAF…"
                    }
                    className={`${f.className} mono max-w-[340px]`}
                  />
                )}
              </Field>

              {saved.telegramTokenHint && (
                <button type="button" onClick={forgetToken} className="eyebrow mt-2 hover:text-rose">
                  Forget the saved token
                </button>
              )}

              <Field id="tg-chat" label="Chat id" className="mt-4">
                {(f) => (
                  <input
                    {...f}
                    value={form.telegramChatId}
                    onChange={set("telegramChatId")}
                    placeholder="123456789"
                    className={`${f.className} mono max-w-[220px]`}
                  />
                )}
              </Field>
            </section>

            {/* EMAIL — the fallback that needs no setup. */}
            <section className="lane mt-10 pt-4">
              <LaneHead title="Email" />
              <Field
                className="mt-4"
                id="alert-email"
                label="Send alerts to"
                hint="Left empty, alerts go to the workspace owner's address."
              >
                {(f) => (
                  <input
                    {...f}
                    type="email"
                    value={form.email}
                    onChange={set("email")}
                    placeholder="dispatch@yourshop.ca"
                    className={`${f.className} mono max-w-[340px]`}
                  />
                )}
              </Field>
            </section>

            {/* QUIET HOURS — a mover at 23:40 does not want a call from a robot. */}
            <section className="lane mt-10 pt-4">
              <LaneHead title="Quiet hours" />
              <p className="measure t-body mt-4 text-ink-2">
                A lead that arrives inside this window waits, and they all come together in one
                message when it ends. Leave both blank to be told at any hour.
              </p>
              <div className="mt-4 flex flex-wrap gap-4">
                <Field id="quiet-from" label="From">
                  {(f) => (
                    <input
                      {...f}
                      type="time"
                      value={form.quietFrom}
                      onChange={set("quietFrom")}
                      className={`${f.className} mono w-[150px]`}
                    />
                  )}
                </Field>
                <Field id="quiet-to" label="Until">
                  {(f) => (
                    <input
                      {...f}
                      type="time"
                      value={form.quietTo}
                      onChange={set("quietTo")}
                      className={`${f.className} mono w-[150px]`}
                    />
                  )}
                </Field>
                <Field id="quiet-tz" label="Time zone">
                  {(f) => (
                    <input
                      {...f}
                      value={form.timezone}
                      onChange={set("timezone")}
                      placeholder="America/Toronto"
                      className={`${f.className} mono w-[220px]`}
                    />
                  )}
                </Field>
              </div>
            </section>

            {error && <ErrorNote className="mt-6">{error}</ErrorNote>}

            <div className="actions mt-6">
              <Button type="submit" disabled={busy}>
                {busy ? "Saving…" : "Save"}
              </Button>
              <Button type="button" variant="ghost" onClick={sendTest} disabled={busy}>
                <Send className="h-3.5 w-3.5" aria-hidden /> Send a test
              </Button>
            </div>

            {test && !test.ok && (
              <ErrorNote className="mt-4">
                {test.headline}
                {test.detail && (
                  <span className="mono t-meta mt-1.5 block text-ink-2">{test.detail}</span>
                )}
              </ErrorNote>
            )}

            {test && test.ok && (
              <div
                className="mt-4 border-l-2 py-2 pl-3"
                style={{ borderColor: "var(--emerald)" }}
                role="status"
              >
                <p className="t-body" style={{ color: "var(--emerald-ink)" }}>
                  {test.headline}
                </p>
                {test.detail && (
                  <p className="mono t-meta mt-1.5 text-ink-2">{test.detail}</p>
                )}
              </div>
            )}
          </form>

          <p className="measure t-meta text-ink-2">
            A failed alert still leaves the lead on the call sheet, and every attempt is
            written into the action log.
          </p>
        </>
      )}
    </div>
  );
}
