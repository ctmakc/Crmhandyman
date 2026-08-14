"use client";

import { useEffect, useState } from "react";
import {
  BackLink,
  Button,
  ErrorNote,
  Field,
  LaneHead,
  PageHead,
  Skeleton,
} from "@/components/ui/primitives";
import { toast } from "@/components/ui/Toaster";

/**
 * BUSINESS DETAILS — the paper screen. Everything here is printed on a document a
 * customer holds, so the page is laid out in the order the document reads: who you
 * are, the tax number the invoice needs, where to find you, how to pay you.
 */

type Details = {
  businessName: string;
  businessAddress: string;
  businessPhone: string;
  businessEmail: string;
  hstNumber: string;
  paymentInstructions: string;
};

const EMPTY: Details = {
  businessName: "",
  businessAddress: "",
  businessPhone: "",
  businessEmail: "",
  hstNumber: "",
  paymentInstructions: "",
};

export default function BusinessDetailsPage() {
  const [form, setForm] = useState<Details>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/settings/business")
      .then((r) => r.json())
      .then((d) => {
        setForm({ ...EMPTY, ...Object.fromEntries(Object.entries(d).map(([k, v]) => [k, v ?? ""])) });
        setLoading(false);
      })
      .catch(() => {
        setError("Your details did not load — check the connection and open this page again.");
        setLoading(false);
      });
  }, []);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");

    const res = await fetch("/api/settings/business", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });

    if (res.ok) {
      toast("Details saved — new documents carry them");
    } else {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "The details did not save. Try again in a moment.");
    }
    setSaving(false);
  }

  const set = (k: keyof Details) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm({ ...form, [k]: e.target.value });

  return (
    <div className="page-doc space-y-6 pb-24 md:pb-0">
      <BackLink href="/settings" label="Settings" />

      <PageHead
        eyebrow="Desk setup · 01"
        title="Business details"
        sub="Printed on every estimate and invoice you hand a customer."
      />

      {loading ? (
        <Skeleton lines={3} />
      ) : (
        <form onSubmit={handleSave}>
          <section className="lane pt-4">
            <LaneHead title="On the paper" />

            <Field id="biz-name" label="Business name" required className="mt-4">
              {(f) => (
                <input
                  {...f}
                  value={form.businessName}
                  onChange={set("businessName")}
                  className={`${f.className} max-w-[420px]`}
                />
              )}
            </Field>

            {/* Why the number matters, in the words of the man who gets the invoice
                back. The long half sits outside the field so it can hold `.measure`;
                a `Field` hint runs the full width of the page. */}
            <Field
              id="biz-hst"
              label="GST / HST number"
              className="mt-4"
              hint="Your CRA number, printed on every invoice over thirty dollars."
            >
              {(f) => (
                <input
                  {...f}
                  value={form.hstNumber}
                  onChange={set("hstNumber")}
                  placeholder="123456789RT0001"
                  className={`${f.className} mono max-w-[260px]`}
                />
              )}
            </Field>
            <p className="measure t-meta mt-1.5 text-ink-2">
              A business customer who cannot see it cannot claim the tax back, and he sends
              the invoice back to you to be redone.
            </p>
          </section>

          <section className="lane mt-10 pt-4">
            <LaneHead title="How a customer reaches you" />

            <Field id="biz-address" label="Address" className="mt-4">
              {(f) => (
                <input
                  {...f}
                  value={form.businessAddress}
                  onChange={set("businessAddress")}
                  placeholder="120 Bank St, Ottawa, ON K1P 5N2"
                  className={`${f.className} max-w-[480px]`}
                />
              )}
            </Field>

            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <Field id="biz-phone" label="Phone">
                {(f) => (
                  <input
                    {...f}
                    value={form.businessPhone}
                    onChange={set("businessPhone")}
                    placeholder="613-555-0100"
                    className={`${f.className} mono max-w-[220px]`}
                  />
                )}
              </Field>
              <Field id="biz-email" label="Email on documents">
                {(f) => (
                  <input
                    {...f}
                    type="email"
                    value={form.businessEmail}
                    onChange={set("businessEmail")}
                    placeholder="office@yourshop.ca"
                    className={`${f.className} mono max-w-[300px]`}
                  />
                )}
              </Field>
            </div>
          </section>

          <section className="lane mt-10 pt-4">
            <LaneHead title="How to pay you" />

            <Field
              className="mt-4"
              id="biz-pay"
              label="Payment instructions"
              hint="Printed on the remittance stub the customer tears off the bottom of the invoice."
            >
              {(f) => (
                <textarea
                  {...f}
                  value={form.paymentInstructions}
                  onChange={set("paymentInstructions")}
                  rows={3}
                  placeholder={"Interac e-Transfer to pay@yourshop.ca\nCheques payable to Your Shop Ltd."}
                  className={`${f.className} max-w-[480px]`}
                />
              )}
            </Field>
          </section>

          {error && <ErrorNote className="mt-6">{error}</ErrorNote>}

          <div className="actions mt-6">
            <Button type="submit" disabled={saving}>
              {saving ? "Saving…" : "Save details"}
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
