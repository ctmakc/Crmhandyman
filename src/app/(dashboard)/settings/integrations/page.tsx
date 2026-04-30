"use client";

import { useState } from "react";
import Link from "next/link";
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
    <div className="max-w-2xl space-y-4 pb-20 md:pb-0">
      <div className="flex items-center gap-3">
        <Link href="/settings" className="text-gray-500 hover:text-gray-900">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <h1 className="text-xl font-bold text-gray-900">Channel Integrations</h1>
      </div>

      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-sm text-blue-700">
        <p className="font-medium mb-1">Webhook URLs for your integrations:</p>
        <p>Facebook/Instagram: <code className="bg-blue-100 px-1 rounded">/api/webhooks/facebook</code></p>
        <p>Instagram: <code className="bg-blue-100 px-1 rounded">/api/webhooks/instagram</code></p>
        <p>Email (Mailgun): <code className="bg-blue-100 px-1 rounded">/api/webhooks/email</code></p>
        <p className="mt-1 text-blue-600">Verify token: <code className="bg-blue-100 px-1 rounded">{typeof window !== "undefined" ? process.env.NEXT_PUBLIC_META_WEBHOOK_TOKEN || "Set META_WEBHOOK_VERIFY_TOKEN in .env" : "Set META_WEBHOOK_VERIFY_TOKEN"}</code></p>
      </div>

      <div className="space-y-4">
        {integrations.map(integration => (
          <div key={integration.channel} className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
            <div className="flex items-start gap-3 mb-3">
              <span className="text-2xl">{integration.icon}</span>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <h2 className="font-semibold text-gray-900">{integration.label}</h2>
                  {integration.docsUrl && (
                    <a href={integration.docsUrl} target="_blank" rel="noopener noreferrer"
                      className="text-gray-400 hover:text-blue-600">
                      <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  )}
                </div>
                <p className="text-xs text-gray-500 mt-0.5">{integration.description}</p>
              </div>
            </div>

            <div className="space-y-2">
              {integration.fields.map(field => (
                <div key={field.key}>
                  <label className="text-xs font-medium text-gray-600">{field.label}</label>
                  <input
                    type={field.type || "password"}
                    placeholder={field.placeholder}
                    value={forms[integration.channel]?.[field.key] || ""}
                    onChange={e => updateField(integration.channel, field.key, e.target.value)}
                    className="w-full mt-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              ))}
            </div>

            <button
              onClick={() => handleSave(integration.channel)}
              className={`mt-3 flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                saved[integration.channel]
                  ? "bg-green-600 text-white"
                  : "bg-gray-900 text-white hover:bg-gray-800"
              }`}
            >
              {saved[integration.channel] ? (
                <><Check className="h-4 w-4" /> Saved!</>
              ) : "Save Configuration"}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
