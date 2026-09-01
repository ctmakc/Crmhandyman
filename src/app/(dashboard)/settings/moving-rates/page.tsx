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
  Stamp,
} from "@/components/ui/primitives";
import { toast } from "@/components/ui/Toaster";
import {
  EMPTY_MOVING_RATE_CARD_FORM,
  type MovingRateCardForm,
} from "@/lib/moving-rate-card";

export default function MovingRatesPage() {
  const [form, setForm] = useState<MovingRateCardForm>(EMPTY_MOVING_RATE_CARD_FORM);
  const [configured, setConfigured] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/settings/moving-rates")
      .then(async (r) => {
        if (!r.ok) throw new Error("load");
        return r.json();
      })
      .then((data) => {
        if (data.rateCard) setForm({ ...EMPTY_MOVING_RATE_CARD_FORM, ...data.rateCard });
        setConfigured(Boolean(data.configured));
        setLoading(false);
      })
      .catch(() => {
        setError("Moving rates did not load — check the connection and open this page again.");
        setLoading(false);
      });
  }, []);

  const setMoney = (key: keyof MovingRateCardForm) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm({ ...form, [key]: Number(e.target.value) });

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    const res = await fetch("/api/settings/moving-rates", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data.error || "Moving rates did not save.");
    } else {
      setConfigured(true);
      setForm(data.rateCard);
      toast("Moving rates saved — new quotes use this card");
    }
    setSaving(false);
  }

  const moneyField = (
    id: string,
    label: string,
    key: keyof MovingRateCardForm,
    hint?: string
  ) => (
    <Field id={id} label={label} hint={hint}>
      {(f) => (
        <div className="relative max-w-[220px]">
          <span className="t-body pointer-events-none absolute left-3 top-2 text-ink-3">$</span>
          <input
            {...f}
            type="number"
            min="0"
            max="10000"
            step="0.01"
            value={form[key] || ""}
            onChange={setMoney(key)}
            className={`${f.className} mono pl-7`}
          />
        </div>
      )}
    </Field>
  );

  return (
    <div className="page-doc space-y-6 pb-24 md:pb-0">
      <BackLink href="/settings" label="Settings" />
      <PageHead
        eyebrow="Desk setup · Moving"
        title="Moving rate card"
        sub="The sell rates your estimator is allowed to put on a Beaver Movers quote. No generic demo price is used until this card is saved."
      />

      {loading ? (
        <Skeleton lines={4} />
      ) : (
        <form onSubmit={save}>
          <section className="lane pt-4">
            <LaneHead
              title="Crew + truck"
              right={<Stamp tone={configured ? "good" : "warn"}>{configured ? "LIVE RATES" : "NOT SET"}</Stamp>}
            />
            <p className="measure t-body mt-2 text-ink-2">
              Hourly sell price for the whole crew and truck. Travel time uses the same crew rate.
            </p>
            <div className="mt-5 grid gap-5 sm:grid-cols-3">
              {moneyField("move-rate-2", "2 movers + 20ft truck / hr", "crew2Hourly")}
              {moneyField("move-rate-3", "3 movers + 26ft truck / hr", "crew3Hourly")}
              {moneyField("move-rate-4", "4 movers + 26ft truck / hr", "crew4Hourly")}
            </div>
          </section>

          <section className="lane mt-10 pt-4">
            <LaneHead title="Add-ons" />
            <p className="measure t-body mt-2 text-ink-2">
              Zero is valid for an add-on you do not charge. Every line remains editable on the estimate.
            </p>
            <div className="mt-5 grid gap-5 sm:grid-cols-2">
              {moneyField("move-stairs", "Stair carry / flight", "stairFlight")}
              {moneyField("move-pack", "Packing materials kit", "packingKit")}
              {moneyField("move-wardrobe", "Wardrobe box rental", "wardrobeBox")}
              {moneyField("move-piano", "Piano / safe handling", "pianoSafe")}
            </div>
          </section>

          {error && <ErrorNote className="mt-6">{error}</ErrorNote>}
          <div className="actions mt-6">
            <Button type="submit" disabled={saving}>
              {saving ? "Saving…" : configured ? "Save rate card" : "Activate rate card"}
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
