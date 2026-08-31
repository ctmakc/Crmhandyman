"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  BackLink,
  Button,
  Chip,
  Empty,
  ErrorNote,
  PageHead,
  Skeleton,
} from "@/components/ui/primitives";
import { toast } from "@/components/ui/Toaster";

type LeadFeeRow = {
  id: string;
  name: string;
  source: string;
  jobType: string | null;
  city: string | null;
  status: string;
  createdAt: string;
  acquisitionCost: number | null;
};

const SOURCE_LABEL: Record<string, string> = {
  GOOGLE_LSA: "Google LSA",
  HOMESTARS: "HomeStars",
  BARK: "Bark",
  URBANTASKER: "UrbanTasker",
  MOVINGWALDO: "MovingWaldo",
};

const CAD = new Intl.NumberFormat("en-CA", {
  style: "currency",
  currency: "CAD",
});

function dateText(value: string) {
  return new Intl.DateTimeFormat("en-CA", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));
}

export default function LeadCostsPage() {
  const [rows, setRows] = useState<LeadFeeRow[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [missingOnly, setMissingOnly] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<string | null>(null);

  async function load() {
    setFailed(false);
    const res = await fetch("/api/acquisition/lead-fees", { cache: "no-store" });
    if (!res.ok) {
      setFailed(true);
      return;
    }
    const data = (await res.json()) as LeadFeeRow[];
    setRows(data);
    setDrafts(
      Object.fromEntries(
        data.map((row) => [
          row.id,
          row.acquisitionCost === null ? "" : row.acquisitionCost.toFixed(2),
        ])
      )
    );
  }

  useEffect(() => {
    void load();
  }, []);

  const shown = useMemo(
    () => (rows ?? []).filter((row) => !missingOnly || row.acquisitionCost === null),
    [rows, missingOnly]
  );

  const knownFees = useMemo(
    () => (rows ?? []).reduce((sum, row) => sum + (row.acquisitionCost ?? 0), 0),
    [rows]
  );

  const missingCount = useMemo(
    () => (rows ?? []).filter((row) => row.acquisitionCost === null).length,
    [rows]
  );

  async function save(row: LeadFeeRow) {
    const raw = drafts[row.id] ?? "";
    setSaving(row.id);
    const res = await fetch(`/api/leads/${row.id}/acquisition-cost`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ amount: raw }),
    });
    setSaving(null);

    const body = await res.json().catch(() => null);
    if (!res.ok) {
      toast(body?.error || "Lead cost was not saved", "bad");
      return;
    }

    const amount = typeof body?.amount === "number" ? body.amount : null;
    setRows((current) =>
      current?.map((item) =>
        item.id === row.id ? { ...item, acquisitionCost: amount } : item
      ) ?? null
    );
    setDrafts((current) => ({
      ...current,
      [row.id]: amount === null ? "" : amount.toFixed(2),
    }));
    toast(amount === null ? "Lead cost cleared" : "Lead cost saved");
  }

  return (
    <div className="page-doc space-y-6 pb-24 md:pb-0">
      <BackLink href="/settings" label="Settings" />
      <PageHead
        eyebrow="Desk setup · 07"
        title="Lead costs"
        sub="What you actually paid for individual Google LSA, HomeStars, Bark, UrbanTasker and MovingWaldo leads. These amounts feed the source-to-cash report automatically."
      />

      {failed ? (
        <ErrorNote retry={<Button onClick={() => void load()}>Try again</Button>}>
          Lead costs could not be read from the books.
        </ErrorNote>
      ) : rows === null ? (
        <Skeleton lines={5} />
      ) : rows.length === 0 ? (
        <Empty hint="When one of the paid lead marketplaces sends a lead, it will appear here automatically.">
          No marketplace leads yet
        </Empty>
      ) : (
        <>
          <div className="grid gap-4 border-y border-line py-4 sm:grid-cols-3">
            <div>
              <div className="eyebrow">Marketplace leads</div>
              <div className="t-record mt-1 font-black text-ink">{rows.length}</div>
            </div>
            <div>
              <div className="eyebrow">Missing cost</div>
              <div className="t-record mt-1 font-black text-ink">{missingCount}</div>
            </div>
            <div>
              <div className="eyebrow">Known direct fees</div>
              <div className="t-record mt-1 font-black text-ink">{CAD.format(knownFees)}</div>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="measure t-meta text-ink-2">
              Enter the amount actually charged for that specific contact. Leave blank if
              the marketplace did not charge for the lead. Do not also book the same Bark,
              HomeStars or marketplace money in Finance — one payment gets one accounting
              path. Meta/general Google campaign invoices belong in Finance instead.
            </p>
            <label className="eyebrow flex cursor-pointer items-center gap-2 whitespace-nowrap">
              <input
                type="checkbox"
                checked={missingOnly}
                onChange={(e) => setMissingOnly(e.target.checked)}
                className="h-4 w-4 accent-current"
              />
              Missing cost only
            </label>
          </div>

          {shown.length === 0 ? (
            <Empty hint="Turn off the filter to review already priced leads.">
              Every visible marketplace lead has a cost
            </Empty>
          ) : (
            <div className="divide-y divide-line border-y border-line">
              {shown.map((row) => {
                const saved = row.acquisitionCost;
                const draft = drafts[row.id] ?? "";
                const normalizedSaved = saved === null ? "" : saved.toFixed(2);
                const dirty = draft.trim() !== normalizedSaved;

                return (
                  <div
                    key={row.id}
                    className="grid gap-3 py-4 lg:grid-cols-[minmax(0,1fr)_190px] lg:items-center"
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <Link
                          href={`/leads/${row.id}`}
                          className="t-row font-bold text-ink underline-offset-4 hover:underline"
                        >
                          {row.name}
                        </Link>
                        <Chip>{SOURCE_LABEL[row.source] || row.source}</Chip>
                        <span className="eyebrow">{row.status.replace("_", " ")}</span>
                      </div>
                      <p className="t-meta mt-1.5 text-ink-2">
                        {[row.jobType, row.city, dateText(row.createdAt)]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                    </div>

                    <div className="flex items-end gap-2 lg:justify-end">
                      <label className="min-w-0 flex-1 lg:max-w-[120px]">
                        <span className="eyebrow mb-1 block">Cost CAD</span>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          inputMode="decimal"
                          value={draft}
                          onChange={(e) =>
                            setDrafts((current) => ({ ...current, [row.id]: e.target.value }))
                          }
                          placeholder="—"
                          className="control mono"
                          aria-label={`Acquisition cost for ${row.name}`}
                        />
                      </label>
                      <Button
                        variant={dirty ? "primary" : "ghost"}
                        onClick={() => void save(row)}
                        disabled={!dirty || saving === row.id}
                      >
                        {saving === row.id ? "…" : "Save"}
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}
