"use client";

import { useCallback, useEffect, useState } from "react";
import { BackLink, Button, Field, LaneHead, PageHead, Status } from "@/components/ui/primitives";
import { Check, ExternalLink } from "lucide-react";

/**
 * INTAKE CHANNELS — where a lead comes from before anyone picks up the phone.
 *
 * One ruled section per channel: what it does in a sentence a contractor reads once,
 * the two or three values his ad account hands him, and one button. The icons that
 * used to head each section were emoji, which the interface does not carry.
 *
 * Each section opens with a readiness stub. "Saved" used to be the only word this
 * screen knew, and a saved token on a server with no META_APP_SECRET receives exactly
 * nothing — the webhook fails closed. The stub reads GET /api/settings/integrations,
 * which reports both halves of readiness (the tenant's row AND the server env, as
 * booleans), and a channel that cannot receive says the one thing to do next.
 */

type ChannelFacts = { isActive: boolean; hasAccessToken: boolean; hasPageId: boolean };

interface IntakeStatus {
  server: {
    metaAppSecret: boolean;
    metaVerifyToken: boolean;
    mailgunSigningKey: boolean;
    smtpOutbound: boolean;
  };
  channels: {
    FACEBOOK: ChannelFacts;
    INSTAGRAM: ChannelFacts;
    GOOGLE: ChannelFacts;
    EMAIL: { isActive: boolean; inboundAddress: string | null };
  };
}

/** Ready, or the one next move — never both. The doc path is printed, not linked. */
type Readiness = { ready: boolean; next?: string; doc?: string };

function metaReadiness(status: IntakeStatus, channel: "FACEBOOK" | "INSTAGRAM"): Readiness {
  const facts = status.channels[channel];
  if (!status.server.metaAppSecret || !status.server.metaVerifyToken) {
    return {
      ready: false,
      next: "The server has no META_APP_SECRET / META_WEBHOOK_VERIFY_TOKEN, so every delivery is refused. Ask whoever runs the server to set them —",
      doc: "docs/META-SETUP.md",
    };
  }
  if (!facts.hasAccessToken || !facts.hasPageId) {
    return {
      ready: false,
      next: "Paste the access token and the id below, then save.",
      doc: "docs/META-SETUP.md",
    };
  }
  if (!facts.isActive) {
    return { ready: false, next: "Credentials are on file with the channel switched off. Saving switches it back on." };
  }
  return { ready: true };
}

function emailReadiness(status: IntakeStatus): Readiness {
  if (!status.server.mailgunSigningKey) {
    return {
      ready: false,
      next: "The server has no MAILGUN_WEBHOOK_SIGNING_KEY, so inbound mail is refused. Ask whoever runs the server to set it —",
      doc: "docs/EMAIL-CHANNEL.md",
    };
  }
  const email = status.channels.EMAIL;
  if (!email.inboundAddress) {
    return {
      ready: false,
      next: "Set the forwarding address below and save.",
      doc: "docs/EMAIL-CHANNEL.md",
    };
  }
  if (!email.isActive) {
    return { ready: false, next: "An address is on file with the channel switched off. Saving switches it back on." };
  }
  return { ready: true };
}

/**
 * The stub itself: a dot, a word, and — when something is missing — the move.
 * Emerald marks a channel that can receive right now; slate marks one that cannot.
 * The amber lamp stays out of this: setup work is not a live job.
 */
function ReadyStub({ readiness, detail }: { readiness: Readiness; detail?: string | null }) {
  return (
    <div className="mt-3 flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-line pb-3">
      <Status
        value={readiness.ready ? "READY" : "NOT READY"}
        tone={readiness.ready ? "var(--emerald)" : "var(--slate)"}
      />
      {detail && <span className="mono t-meta text-ink-2">{detail}</span>}
      {!readiness.ready && (
        <span className="t-meta text-ink-2">
          {readiness.next}
          {readiness.doc && <> {" "}<span className="mono text-ink">{readiness.doc}</span></>}
        </span>
      )}
    </div>
  );
}

interface IntegrationConfig {
  channel: string;
  label: string;
  description: string;
  fields: { key: string; label: string; placeholder: string; type?: string; wide?: boolean }[];
  docsUrl?: string;
}

const integrations: IntegrationConfig[] = [
  {
    channel: "FACEBOOK",
    label: "Facebook Lead Ads",
    description:
      "Somebody fills in your lead form on Facebook and the lead is on the call sheet before he closes the app. The three values below come from your Meta developer app.",
    fields: [
      { key: "accessToken", label: "Page access token", placeholder: "EAAxxxxxxx…" },
      { key: "pageId", label: "Facebook page id", placeholder: "123456789…" },
      { key: "webhookSecret", label: "Webhook secret", placeholder: "your-app-secret" },
    ],
    docsUrl: "https://developers.facebook.com/docs/marketing-api/guides/lead-ads/",
  },
  {
    channel: "INSTAGRAM",
    label: "Instagram messages",
    description:
      "A message to your Instagram business account asking about work lands here as a lead. It uses the same Meta app as Facebook.",
    fields: [
      { key: "accessToken", label: "Instagram access token", placeholder: "EAAxxxxxxx…" },
      { key: "pageId", label: "Instagram business account id", placeholder: "987654321…" },
    ],
    docsUrl: "https://developers.facebook.com/docs/messenger-platform/instagram/",
  },
  {
    channel: "GOOGLE",
    label: "Google Local Services",
    description:
      "Calls and messages you pay Google for arrive on the sheet with the rest of the day's leads.",
    fields: [{ key: "accessToken", label: "Google access token", placeholder: "ya29.xxxxxxx…" }],
    docsUrl: "https://developers.google.com/local-services-ads/contact_leads/overview",
  },
  {
    channel: "EMAIL",
    label: "Email · HomeStars · Kijiji",
    description:
      "Forward the notification emails from HomeStars, Kijiji or any other marketplace to the address below and each one becomes a lead.",
    fields: [
      {
        key: "config",
        label: "Mailgun forwarding address",
        placeholder: "leads@mg.yourdomain.com",
        type: "text",
        wide: true,
      },
    ],
  },
];

const ENDPOINTS: [string, string][] = [
  ["Facebook", "/api/webhooks/facebook"],
  ["Instagram", "/api/webhooks/instagram"],
  ["Email (Mailgun)", "/api/webhooks/email"],
];

export default function IntegrationsPage() {
  const [saved, setSaved] = useState<Record<string, boolean>>({});
  const [forms, setForms] = useState<Record<string, Record<string, string>>>({});

  /**
   * null while loading; a failed read stays null and the stubs simply don't render —
   * a guessed READY would be worse than no stub at all.
   */
  const [status, setStatus] = useState<IntakeStatus | null>(null);
  const [statusRefused, setStatusRefused] = useState(false);

  const loadStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/settings/integrations");
      if (!res.ok) throw new Error(String(res.status));
      setStatus(await res.json());
      setStatusRefused(false);
    } catch {
      setStatus(null);
      setStatusRefused(true);
    }
  }, []);

  useEffect(() => {
    loadStatus();
  }, [loadStatus]);

  async function handleSave(channel: string) {
    const data = forms[channel] || {};
    await fetch(`/api/settings/integrations/${channel.toLowerCase()}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...data, isActive: true }),
    });
    setSaved((prev) => ({ ...prev, [channel]: true }));
    setTimeout(() => setSaved((prev) => ({ ...prev, [channel]: false })), 2000);
    // The stub must state what the save actually changed, so it re-reads the server.
    loadStatus();
  }

  function updateField(channel: string, key: string, value: string) {
    setForms((prev) => ({
      ...prev,
      [channel]: { ...(prev[channel] || {}), [key]: value },
    }));
  }

  return (
    <div className="page-doc space-y-6 pb-24 md:pb-0">
      <BackLink href="/settings" label="Settings" />

      <PageHead
        eyebrow="Desk setup · 03"
        title="Intake channels"
        sub="Where leads come from before anyone picks up the phone."
      />

      {/* The addresses you paste into the provider's console. Mono, and on a rule
          rather than in a box: it is a reference line, not a piece of paper. */}
      <section className="lane pt-4">
        <LaneHead title="Paste these into the provider" />
        <dl className="mt-4 space-y-2">
          {ENDPOINTS.map(([k, v]) => (
            <div key={k} className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
              <dt className="t-body w-[150px] shrink-0 text-ink-2">{k}</dt>
              <dd className="mono t-meta break-all text-ink">{v}</dd>
            </div>
          ))}
          <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 border-t border-line pt-2">
            <dt className="t-body w-[150px] shrink-0 text-ink-2">Verify token</dt>
            {/* Printing the token here would ship it in the browser bundle to every
                signed-in user. Meta needs the value the server holds. */}
            <dd className="mono t-meta break-all text-ink-3">
              META_WEBHOOK_VERIFY_TOKEN, from the server&apos;s .env
            </dd>
          </div>
        </dl>
      </section>

      {statusRefused && (
        <p className="t-meta border-b border-line pb-3 text-ink-2">
          Channel status could not be read — the readiness marks below are hidden rather
          than guessed. Reload to try again.
        </p>
      )}

      {integrations.map((integration) => {
        /**
         * GOOGLE carries no stub: there is no Google webhook in this codebase to be
         * ready FOR, so any READY word there would be the exact lie this stub exists
         * to end.
         */
        const readiness = status
          ? integration.channel === "FACEBOOK" || integration.channel === "INSTAGRAM"
            ? metaReadiness(status, integration.channel)
            : integration.channel === "EMAIL"
              ? emailReadiness(status)
              : null
          : null;

        return (
        <section key={integration.channel} className="lane mt-10 pt-4">
          <LaneHead
            title={integration.label}
            right={
              integration.docsUrl && (
                <a
                  href={integration.docsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="eyebrow inline-flex items-center gap-1.5 hover:text-ink"
                >
                  Setup guide
                  <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                </a>
              )
            }
          />
          {readiness && (
            <ReadyStub
              readiness={readiness}
              detail={
                /* The address is shown in both states: an admin mid-setup needs to see
                   what is on file exactly when the channel is still refusing mail. */
                integration.channel === "EMAIL" && status?.channels.EMAIL.inboundAddress
                  ? `${readiness.ready ? "receiving at" : "address on file ·"} ${status.channels.EMAIL.inboundAddress}`
                  : undefined
              }
            />
          )}
          {integration.channel === "EMAIL" && status && (
            /* Outbound is the other half of the mail story — estimates and reminders
               leave through SMTP, and its presence is a server fact the admin cannot
               see from here otherwise. Presence only; never the credentials. */
            <p className="t-meta mt-3 text-ink-2">
              Outbound mail (estimates, reminders):{" "}
              {status.server.smtpOutbound ? (
                "SMTP is configured on the server."
              ) : (
                <>
                  the server has no SMTP account, so the desk cannot send.{" "}
                  <span className="mono text-ink">docs/EMAIL-CHANNEL.md</span>
                </>
              )}
            </p>
          )}
          <p className="measure t-body mt-4 text-ink-2">{integration.description}</p>

          <div className="mt-4 space-y-4">
            {integration.fields.map((field) => (
              <Field
                key={field.key}
                id={`${integration.channel}-${field.key}`}
                label={field.label}
              >
                {(f) => (
                  <input
                    {...f}
                    type={field.type || "password"}
                    autoComplete="off"
                    placeholder={field.placeholder}
                    value={forms[integration.channel]?.[field.key] || ""}
                    onChange={(e) => updateField(integration.channel, field.key, e.target.value)}
                    className={`${f.className} mono ${field.wide ? "max-w-[420px]" : "max-w-[340px]"}`}
                  />
                )}
              </Field>
            ))}
          </div>

          <div className="actions mt-4">
            <Button onClick={() => handleSave(integration.channel)}>
              {saved[integration.channel] ? (
                <>
                  <Check className="h-4 w-4" aria-hidden /> Saved
                </>
              ) : (
                "Save channel"
              )}
            </Button>
          </div>
        </section>
        );
      })}
    </div>
  );
}
