"use client";

import { useState } from "react";
import { BackLink, Button, Field, LaneHead, PageHead } from "@/components/ui/primitives";
import { Check, ExternalLink } from "lucide-react";

/**
 * INTAKE CHANNELS — where a lead comes from before anyone picks up the phone.
 *
 * One ruled section per channel: what it does in a sentence a contractor reads once,
 * the two or three values his ad account hands him, and one button. The icons that
 * used to head each section were emoji, which the interface does not carry.
 */

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

  async function handleSave(channel: string) {
    const data = forms[channel] || {};
    await fetch(`/api/settings/integrations/${channel.toLowerCase()}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...data, isActive: true }),
    });
    setSaved((prev) => ({ ...prev, [channel]: true }));
    setTimeout(() => setSaved((prev) => ({ ...prev, [channel]: false })), 2000);
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

      {integrations.map((integration) => (
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
      ))}
    </div>
  );
}
