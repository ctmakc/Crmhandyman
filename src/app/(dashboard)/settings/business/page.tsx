"use client";

import { useEffect, useState } from "react";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { PageHead, Plate, buttonClass } from "@/components/ui/primitives";
import { toast } from "@/components/ui/Toaster";

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
        setError("Could not load your details");
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
      setError(data.error || "Could not save");
    }
    setSaving(false);
  }

  const set = (k: keyof Details) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm({ ...form, [k]: e.target.value });

  return (
    <div className="max-w-2xl space-y-6 pb-24 md:pb-0">
      <Link href="/settings" className="eyebrow inline-flex items-center gap-1.5 hover:text-ink">
        <ArrowLeft className="h-3.5 w-3.5" /> Settings
      </Link>

      <PageHead
        eyebrow="Desk setup · 01"
        title="Business details"
        sub="Printed on every estimate and invoice you hand a customer"
      />

      {loading ? (
        <Plate className="p-5">
          <div className="eyebrow">Loading…</div>
        </Plate>
      ) : (
        <Plate className="p-5">
          <form onSubmit={handleSave} className="space-y-4">
            <div>
              <label className="eyebrow">Business name *</label>
              <input
                required
                value={form.businessName}
                onChange={set("businessName")}
                className="mt-1.5 w-full px-3 py-2 text-[13px]"
              />
            </div>

            <div>
              <label className="eyebrow">GST / HST number</label>
              <input
                value={form.hstNumber}
                onChange={set("hstNumber")}
                placeholder="123456789RT0001"
                className="mono mt-1.5 w-full px-3 py-2 text-[13px]"
              />
              <p className="mt-1.5 text-[12px] text-ink-2">
                CRA requires it on any invoice over $30. A business customer without it
                loses the input tax credit and sends the invoice back.
              </p>
            </div>

            <div>
              <label className="eyebrow">Address</label>
              <input
                value={form.businessAddress}
                onChange={set("businessAddress")}
                placeholder="120 Bank St, Ottawa, ON K1P 5N2"
                className="mt-1.5 w-full px-3 py-2 text-[13px]"
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="eyebrow">Phone</label>
                <input
                  value={form.businessPhone}
                  onChange={set("businessPhone")}
                  placeholder="613-555-0100"
                  className="mono mt-1.5 w-full px-3 py-2 text-[13px]"
                />
              </div>
              <div>
                <label className="eyebrow">Email on documents</label>
                <input
                  type="email"
                  value={form.businessEmail}
                  onChange={set("businessEmail")}
                  placeholder="office@yourshop.ca"
                  className="mono mt-1.5 w-full px-3 py-2 text-[13px]"
                />
              </div>
            </div>

            <div>
              <label className="eyebrow">How to pay</label>
              <textarea
                value={form.paymentInstructions}
                onChange={set("paymentInstructions")}
                rows={3}
                placeholder={"Interac e-Transfer to pay@yourshop.ca\nCheques payable to Your Shop Ltd."}
                className="mt-1.5 w-full px-3 py-2 text-[13px]"
              />
              <p className="mt-1.5 text-[12px] text-ink-2">
                Printed on the remittance stub the customer tears off.
              </p>
            </div>

            {error && (
              <p
                className="mono border-l-2 py-1 pl-3 text-[12px]"
                style={{ borderColor: "var(--rose)", color: "var(--rose-ink)" }}
              >
                {error}
              </p>
            )}

            <button type="submit" disabled={saving} className={buttonClass("primary")}>
              {saving ? "Saving…" : "Save details"}
            </button>
          </form>
        </Plate>
      )}
    </div>
  );
}
