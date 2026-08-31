"use client";

import { useEffect, useState } from "react";
import { BackLink, Button, Field, PageHead, Status } from "@/components/ui/primitives";
import { toast } from "@/components/ui/Toaster";

type SmsIntegration = {
  isActive: boolean;
  pageId: string | null;
  config: string | null;
  normalizedAddress: string | null;
  hasAccessToken: boolean;
  accessTokenHint: string | null;
};

export default function SmsSettingsPage() {
  const [loaded, setLoaded] = useState<SmsIntegration | null>(null);
  const [accountSid, setAccountSid] = useState("");
  const [authToken, setAuthToken] = useState("");
  const [fromNumber, setFromNumber] = useState("");
  const [saving, setSaving] = useState(false);

  async function load() {
    const res = await fetch("/api/settings/integrations/sms");
    if (!res.ok) {
      toast("SMS settings could not be read", "bad");
      return;
    }
    const data = (await res.json()) as SmsIntegration;
    setLoaded(data);
    setAccountSid(data.pageId || "");
    setFromNumber(data.normalizedAddress || "");
  }

  useEffect(() => {
    load();
  }, []);

  const ready = Boolean(
    loaded?.isActive && loaded.hasAccessToken && loaded.pageId && loaded.normalizedAddress,
  );

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const res = await fetch("/api/settings/integrations/sms", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        pageId: accountSid,
        accessToken: authToken,
        config: fromNumber,
        isActive: true,
      }),
    });
    setSaving(false);
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      toast(body?.error || "SMS settings were not saved", "bad");
      return;
    }
    setAuthToken("");
    toast("SMS channel saved");
    load();
  }

  return (
    <div className="page-doc space-y-6 pb-24 md:pb-0">
      <BackLink href="/settings" label="Settings" />
      <PageHead
        eyebrow="Desk setup · 06"
        title="SMS"
        sub="Two-way customer texting through a dedicated Twilio number. The auth token is write-only and never comes back to the browser."
      />

      <div className="border-b border-line pb-4">
        <Status
          value={ready ? "READY" : "NOT READY"}
          tone={ready ? "var(--emerald)" : "var(--slate)"}
        />
        <p className="t-meta mt-2 text-ink-2">
          {ready
            ? `Sending and receiving on ${loaded?.normalizedAddress}`
            : "Add the Account SID, Auth Token and Twilio phone number below."}
        </p>
      </div>

      <form onSubmit={save} className="space-y-4">
        <Field id="twilio-account-sid" label="Twilio Account SID" required>
          {(f) => (
            <input
              {...f}
              value={accountSid}
              onChange={(e) => setAccountSid(e.target.value)}
              placeholder="ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
              className={`${f.className} mono max-w-[420px]`}
            />
          )}
        </Field>

        <Field
          id="twilio-auth-token"
          label="Twilio Auth Token"
          hint={
            loaded?.hasAccessToken
              ? `A token ending ${loaded.accessTokenHint || "••••"} is already on file. Leave blank to keep it.`
              : "Stored server-side in the integration record and never returned by the API."
          }
        >
          {(f) => (
            <input
              {...f}
              type="password"
              autoComplete="off"
              value={authToken}
              onChange={(e) => setAuthToken(e.target.value)}
              placeholder={loaded?.hasAccessToken ? "Leave blank to keep existing token" : "Twilio auth token"}
              className={`${f.className} mono max-w-[420px]`}
            />
          )}
        </Field>

        <Field
          id="twilio-number"
          label="Twilio phone number"
          hint="Canadian/US 10-digit or E.164. One number can belong to only one workspace."
          required
        >
          {(f) => (
            <input
              {...f}
              type="tel"
              value={fromNumber}
              onChange={(e) => setFromNumber(e.target.value)}
              placeholder="+16135550100"
              className={`${f.className} mono max-w-[420px]`}
            />
          )}
        </Field>

        <div className="actions pt-1">
          <Button type="submit" variant="primary" disabled={saving}>
            {saving ? "Saving…" : "Save SMS channel"}
          </Button>
        </div>
      </form>

      <section className="lane pt-4">
        <div className="eyebrow">Twilio inbound webhook</div>
        <p className="measure t-body mt-2 text-ink-2">
          Set the number&apos;s incoming-message webhook to this CRM endpoint using HTTP POST:
        </p>
        <p className="mono t-meta mt-2 break-all text-ink">/api/webhooks/twilio/sms</p>
      </section>
    </div>
  );
}
