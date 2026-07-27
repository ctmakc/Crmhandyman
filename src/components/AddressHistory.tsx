"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { History } from "lucide-react";
import { formatDate } from "@/lib/utils";
import { spineFor, textToneFor } from "@/components/ui/primitives";

interface PastJob {
  id: string;
  title: string;
  jobType?: string | null;
  status: string;
  scheduledDate?: string | null;
  completedDate?: string | null;
}

interface Unit {
  id: string;
  kind: string;
  brand?: string | null;
  model?: string | null;
  serial?: string | null;
  location?: string | null;
  installedAt?: string | null;
  warrantyUntil?: string | null;
}

/**
 * «Этот адрес уже был» — what happened here before, and what iron is in the basement.
 * Renders nothing when there is no history, so a first visit stays quiet.
 */
export default function AddressHistory({ projectId }: { projectId: string }) {
  const [previous, setPrevious] = useState<PastJob[]>([]);
  const [equipment, setEquipment] = useState<Unit[]>([]);
  const [clientId, setClientId] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/projects/${projectId}/history`)
      .then((r) => r.json())
      .then((d) => {
        setPrevious(d.previous || []);
        setEquipment(d.equipment || []);
        setClientId(d.clientId || null);
      })
      .catch(() => null);
  }, [projectId]);

  if (!previous.length && !equipment.length) return null;

  return (
    <section className="border border-line bg-sunk">
      <div className="flex items-center justify-between border-b border-line px-5 py-3">
        <h2 className="flex items-center gap-2 text-[13px] font-bold uppercase tracking-[0.06em] text-ink">
          <History className="h-3.5 w-3.5" strokeWidth={2} />
          This address has been here before
        </h2>
        {clientId && (
          <Link href={`/clients/${clientId}`} className="eyebrow hover:text-ink">
            Client record →
          </Link>
        )}
      </div>

      {equipment.length > 0 && (
        <div className="border-b border-line px-5 py-3">
          <div className="eyebrow">Installed on site</div>
          <div className="mt-2 space-y-1.5">
            {equipment.map((eq) => {
              const covered = eq.warrantyUntil && new Date(eq.warrantyUntil) > new Date();
              return (
                <div key={eq.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
                  <span
                    className="mono text-[11px] tracking-[0.06em]"
                    style={{ color: covered ? "var(--emerald)" : "var(--ink-3)" }}
                  >
                    {eq.kind.replace(/_/g, " ")}
                  </span>
                  <span className="text-[13px] font-medium text-ink">
                    {[eq.brand, eq.model].filter(Boolean).join(" ") || "unspecified"}
                  </span>
                  {eq.serial && (
                    <span className="mono text-[12px] text-ink-2">S/N {eq.serial}</span>
                  )}
                  {eq.location && <span className="text-[12px] text-ink-3">{eq.location}</span>}
                  {eq.warrantyUntil && (
                    <span
                      className="mono text-[11px]"
                      style={{ color: covered ? "var(--emerald)" : "var(--ink-3)" }}
                    >
                      {covered ? "under warranty to " : "warranty expired "}
                      {formatDate(eq.warrantyUntil)}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {previous.length > 0 && (
        <div className="px-5 py-3">
          <div className="eyebrow">Previous visits</div>
          <div className="mt-2 space-y-1.5">
            {previous.map((p) => (
              <Link
                key={p.id}
                href={`/projects/${p.id}`}
                className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 transition-colors hover:text-ink"
              >
                <span
                  className="inline-block h-2 w-2 shrink-0 translate-y-[-1px] rounded-full"
                  style={{ background: spineFor(p.status) }}
                />
                <span className="mono text-[12px] text-ink-3">
                  {p.completedDate
                    ? formatDate(p.completedDate)
                    : p.scheduledDate
                      ? formatDate(p.scheduledDate)
                      : "—"}
                </span>
                <span className="text-[13px] font-medium text-ink">{p.title}</span>
                <span className="eyebrow" style={{ color: textToneFor(p.status) }}>
                  {p.status.replace("_", " ")}
                </span>
              </Link>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
