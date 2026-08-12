"use client";

import { useState } from "react";
import Link from "next/link";
import { PageHead, Plate, buttonClass } from "@/components/ui/primitives";
import { ArrowLeft, Check, ExternalLink } from "lucide-react";

interface IntegrationConfig {
  channel: string;
  label: string;
  icon: string;
  description: string;
  fields: { key: string; label: string; placeholder: string; type?: string }[];
  docsUrl?: string;
}

const integrations: IntegrationConfig[] = [
  {
    channel: "FACEBOOK",
    label: "Facebook Lead Ads",
    icon: "📘",
    description: "Automatically receive leads when someone fills a Facebook Lead Ad form. Set up a webhook in your Meta Developer App.",
    fields: [
      { key: "accessToken", label: "Page Access Token", placeholder: "EAAxxxxxxx..." },
      { key: "pageId", label: "Facebook Page ID", placeholder: "123456789..." },
      { key: "webhookSecret", label: "Webhook Secret", placeholder: "your-app-secret" },
    ],
    docsUrl: "https://developers.facebook.com/docs/marketing-api/guides/lead-ads/",
  },
  {
    channel: "INSTAGRAM",
    label: "Instagram Messages",
    icon: "📸",
    description: "Get notified when someone messages your Instagram Business account asking about services. Uses the same Meta app as Facebook.",
    fields: [
      { key: "accessToken", label: "Instagram Access Token", placeholder: "EAAxxxxxxx..." },
      { key: "pageId", label: "Instagram Business Account ID", placeholder: "987654321..." },
    ],
    docsUrl: "https://developers.facebook.com/docs/messenger-platform/instagram/",
  },
  {
    channel: "GOOGLE",
    label: "Google Local Services",
    icon: "🔍",
    description: "Sync leads from Google Local Services Ads (GLSA). Connect via Google OAuth to pull leads automatically.",
    fields: [
      { key: "accessToken", label: "Google Access Token", placeholder: "ya29.xxxxxxx..." },
    ],
    docsUrl: "https://developers.google.com/local-services-ads/contact_leads/overview",
  },
  {
    channel: "EMAIL",
    label: "Email / HomeStars / Kijiji",
    icon: "📧",
    description: "Forward notification emails from HomeStars, Kijiji, or any platform to your Mailgun address. Leads are created automatically.",
    fields: [
      { key: "config", label: "Mailgun Forward Email", placeholder: "e.g. leads@mg.yourdomain.com", type: "text" },
    ],
  },
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
    setSaved(prev => ({ ...prev, [channel]: true }));
    setTimeout(() => setSaved(prev => ({ ...prev, [channel]: false })), 2000);
  }

  function updateField(channel: string, key: string, value: string) {
    setForms(prev => ({
      ...prev,
      [channel]: { ...(prev[channel] || {}), [key]: value }
    }));
  }

  return (
    <div className="max-w-2xl space-y-6 pb-24 md:pb-0">
      <Link href="/settings" className="eyebrow inline-flex items-center gap-1.5 hover:text-ink">
        <ArrowLeft className="h-3.5 w-3.5" /> Settings
      </Link>

      <PageHead
        eyebrow="Desk setup · 02"
        title="Intake channels"
        sub="Where leads come from before anyone picks up the phone."
      />

      {/* The endpoints you paste into the provider consoles — mono, copyable. */}
      <div className="border border-line bg-sunk px-5 py-4">
        <div className="eyebrow">Webhook endpoints</div>
        <dl className="mt-3 space-y-1.5">
          {[
            ["Facebook", "/api/webhooks/facebook"],
            ["Instagram", "/api/webhooks/instagram"],
            ["Email (Mailgun)", "/api/webhooks/email"],
          ].map(([k, v]) => (
            <div key={k} className="flex flex-wrap items-baseline gap-x-3">
              <dt className="w-[130px] shrink-0 text-[13px] text-ink-2">{k}</dt>
              <dd className="mono text-[12px] text-ink">{v}</dd>
            </div>
          ))}
          <div className="flex flex-wrap items-baseline gap-x-3 border-t border-line pt-2">
            <dt className="w-[130px] shrink-0 text-[13px] text-ink-2">Verify token</dt>
            {/* Printing the token here would ship it in the browser bundle to every
                signed-in user. Meta needs the value the server holds. */}
            <dd className="mono text-[12px] text-ink-3">META_WEBHOOK_VERIFY_TOKEN, from the server&apos;s .env</dd>
          </div>
        </dl>
      </div>

      <div className="space-y-4">
        {integrations.map(integration => (
          <Plate key={integration.channel} className="p-5">
            <div className="mb-4 flex items-start gap-3">
              <span className="text-[20px] leading-none">{integration.icon}</span>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <h2 className="text-[15px] font-bold text-ink">{integration.label}</h2>
                  {integration.docsUrl && (
                    <a href={integration.docsUrl} target="_blank" rel="noopener noreferrer"
                      className="text-ink-3 transition-colors hover:text-ink">
                      <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  )}
                </div>
                <p className="mt-1 text-[13px] text-ink-2">{integration.description}</p>
              </div>
            </div>

            <div className="space-y-3">
              {integration.fields.map(field => (
                <div key={field.key}>
                  <label className="eyebrow">{field.label}</label>
                  <input
                    type={field.type || "password"}
                    placeholder={field.placeholder}
                    value={forms[integration.channel]?.[field.key] || ""}
                    onChange={e => updateField(integration.channel, field.key, e.target.value)}
                    className="mt-1.5 w-full px-3 py-2 text-[13px]"
                  />
                </div>
              ))}
            </div>

            <button
              onClick={() => handleSave(integration.channel)}
              className={`${buttonClass("primary")} mt-4`}
            >
              {saved[integration.channel] ? (
                <>
                  <Check className="h-4 w-4" /> Saved
                </>
              ) : (
                "Save configuration"
              )}
            </button>
          </Plate>
        ))}
      </div>
    </div>
  );
}
