"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  BackLink,
  Button,
  PageHead,
  Status,
} from "@/components/ui/primitives";
import type { GoLiveGate, GoLiveReadiness } from "@/lib/go-live-readiness";

const TONE = {
  READY: "var(--emerald)",
  WARN: "var(--amber)",
  BLOCKED: "var(--rose)",
} as const;

function GateRow({ gate }: { gate: GoLiveGate }) {
  return (
    <section className="border-t border-line py-4 first:border-t-0">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="t-row font-bold text-ink">{gate.title}</h2>
            <Status value={gate.state} tone={TONE[gate.state]} />
          </div>
          <p className="measure t-body mt-2 text-ink-2">{gate.summary}</p>
          {gate.details.length ? (
            <div className="mt-2 space-y-1">
              {gate.details.map((detail) => (
                <div key={detail} className="mono t-micro break-words text-ink-3">
                  {detail}
                </div>
              ))}
            </div>
          ) : null}
        </div>
        {gate.href ? (
          <Link href={gate.href} className="eyebrow shrink-0 hover:text-ink">
            Fix / inspect →
          </Link>
        ) : null}
      </div>
    </section>
  );
}

export default function GoLiveReadinessPage() {
  const [data, setData] = useState<GoLiveReadiness | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function load() {
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/settings/go-live", { cache: "no-store" });
      const body = await res.json().catch(() => null);
      if (!res.ok || !body) throw new Error(body?.error || "Readiness check failed");
      setData(body as GoLiveReadiness);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Readiness check failed");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  return (
    <div className="page-doc space-y-6 pb-24 md:pb-0">
      <BackLink href="/settings" label="Settings" />
      <PageHead
        eyebrow="Desk setup · 09"
        title="Go-live readiness"
        sub="One launch verdict from the live workspace itself. BLOCKED means do not turn on paid traffic yet; warnings are operational cleanup, not hidden failures."
      />

      {error ? (
        <div className="border-l-2 border-rose-ink bg-sunk px-4 py-3 t-body text-ink">
          {error}
        </div>
      ) : null}

      {!data ? (
        <div className="border-y border-line py-8">
          <p className="t-body text-ink-2">{busy ? "Checking live workspace…" : "No readiness result yet."}</p>
        </div>
      ) : (
        <>
          <section className="border-y border-line py-5">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <div className="eyebrow">Launch verdict</div>
                <div className="mt-2 flex items-center gap-3">
                  <Status
                    value={data.verdict}
                    tone={data.verdict === "READY" ? "var(--emerald)" : "var(--rose)"}
                  />
                  <span className="t-record font-black text-ink">
                    {data.verdict === "READY" ? "Safe to accept paid traffic" : "Do not turn on paid traffic"}
                  </span>
                </div>
                <p className="mono t-micro mt-2 text-ink-3">{data.expectedWorkspaceUrl}</p>
              </div>
              <div className="flex flex-wrap gap-4">
                <div>
                  <div className="eyebrow">Ready</div>
                  <div className="t-record font-black text-ink">{data.counts.ready}</div>
                </div>
                <div>
                  <div className="eyebrow">Warnings</div>
                  <div className="t-record font-black text-ink">{data.counts.warn}</div>
                </div>
                <div>
                  <div className="eyebrow">Blocked</div>
                  <div className="t-record font-black text-ink">{data.counts.blocked}</div>
                </div>
              </div>
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <Button type="button" variant="ghost" onClick={load} disabled={busy}>
                {busy ? "Checking…" : "Run check again"}
              </Button>
              <span className="mono t-micro text-ink-3">
                Checked {new Date(data.checkedAt).toLocaleString("en-CA")}
              </span>
            </div>
          </section>

          <div>
            {data.gates.map((gate) => (
              <GateRow key={gate.id} gate={gate} />
            ))}
          </div>

          <section className="border-t border-line pt-4">
            <div className="eyebrow">Acceptance rule</div>
            <p className="measure t-body mt-2 text-ink-2">
              A green codebase is not a green launch. Before traffic is enabled, the live tenant must receive a real
              website or Meta test lead, preserve it in the correct workspace, alert the dispatcher and exercise the
              SMS path. This page reads those facts from the tenant and server configuration; it does not accept a
              manually checked box as proof.
            </p>
          </section>
        </>
      )}
    </div>
  );
}
