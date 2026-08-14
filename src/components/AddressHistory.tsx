"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Chip,
  LaneHead,
  Lane,
  Row,
  Stamp,
  textToneFor,
} from "@/components/ui/primitives";

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
 *
 * It used to be a bordered `bg-sunk` box with its own 13px heading — a closed frame
 * where the ladder (air → surface → rule → frame) asks for a rule, and on a 390px
 * screen its heading folded onto two lines and squeezed the link beside it into a
 * two-line stub. It is a section like every other section now.
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
    <section>
      <LaneHead
        title="Been here before"
        right={
          clientId ? (
            <Link href={`/clients/${clientId}`} className="eyebrow hover:text-ink">
              Client record →
            </Link>
          ) : undefined
        }
      />

      <div className="border-t border-line pt-4">
        {equipment.length > 0 && (
          <div>
            <div className="eyebrow">Iron on site</div>
            <div className="mt-2 flex flex-col gap-2">
              {equipment.map((eq) => {
                const covered = eq.warrantyUntil && new Date(eq.warrantyUntil) > new Date();
                return (
                  <div key={eq.id} className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                    <Chip>{eq.kind.replace(/_/g, " ")}</Chip>
                    <span className="t-body font-medium text-ink">
                      {[eq.brand, eq.model].filter(Boolean).join(" ") || "unspecified"}
                    </span>
                    {eq.serial && (
                      <span className="mono t-meta text-ink-2">S/N {eq.serial}</span>
                    )}
                    {eq.location && <span className="t-meta text-ink-3">{eq.location}</span>}
                    {eq.warrantyUntil && (
                      <span
                        className="eyebrow"
                        style={{
                          color: covered ? "var(--emerald-ink)" : "var(--ink-3)",
                        }}
                      >
                        {covered ? "UNDER WARRANTY TO " : "WARRANTY EXPIRED "}
                        <Stamp date={eq.warrantyUntil} />
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {previous.length > 0 && (
          <div className={equipment.length > 0 ? "mt-6" : undefined}>
            <div className="eyebrow">Previous visits</div>
            <Lane className="mt-2">
              {previous.map((p) => (
                <Row key={p.id} href={`/projects/${p.id}`} status={p.status}>
                  <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                    <span className="t-body min-w-0 font-medium text-ink">{p.title}</span>
                    <span className="flex shrink-0 items-baseline gap-3">
                      <span className="eyebrow" style={{ color: textToneFor(p.status) }}>
                        {p.status.replace("_", " ")}
                      </span>
                      <Stamp
                        date={p.completedDate || p.scheduledDate}
                        className="t-meta text-ink-3"
                      />
                    </span>
                  </div>
                </Row>
              ))}
            </Lane>
          </div>
        )}
      </div>
    </section>
  );
}
