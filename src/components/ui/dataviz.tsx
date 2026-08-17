"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { formatCents } from "@/lib/money";

/* ==========================================================================
   MICRO-VISUALISATION — «НАРЯД, но дорого» (DESIGN.md, Revision 4).

   The instruments the command bridge is built from. Everything here obeys the
   same law as the rest of the product: tokens only (a hue is passed in as a CSS
   var string, never a raw hex), one radius language (zero — a readout is not a
   pill), depth from surface + hairline (never a shadow), and motion that moves
   transform/opacity only and collapses under prefers-reduced-motion.

   Four pieces, in the order DESIGN.md lists them:
     Sparkline — a hairline week trend, one accent stroke, no axes.
     MeterBar / AgingBar — a segmented proportion bar in status tones.
     StatTile — the command-bridge readout: eyebrow + counting gauge + foot.
     Balance — the two-sided in/out figure for the finance T-account.
   ========================================================================== */

/* --------------------------------------------------------------------------
   COUNT-UP — the gauge that settles onto its number.
   The one moment of real arithmetic on the bridge: a readout counts from zero
   to the value it holds, once, on the first paint. SSR prints the final figure
   (so a reader with JS off, or the first frame before hydration, sees the truth
   and the layout never shifts); the effect then runs it up from zero. Reduced
   motion skips the run and leaves the figure where it started.
   -------------------------------------------------------------------------- */

const easeOutExpo = (t: number) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t));

/** Split a formatted figure into its unit mark (leading `$`, a sign) and digits. */
function splitUnit(s: string): [string, string] {
  const m = s.match(/^([^\d]*)(.*)$/);
  return [m?.[1] ?? "", m?.[2] ?? s];
}

export function CountUp({
  value,
  money = false,
  format,
  tone,
  unitTone = "var(--ink-3)",
  size = 30,
  className,
  duration = 680,
}: {
  value: number;
  /**
   * `money` prints the figure through `formatCents` — the one flag a Server
   * Component may set, since a formatter FUNCTION cannot cross the server→client
   * boundary. A client caller can still hand its own `format`, which wins.
   */
  money?: boolean;
  /** Runs every animated frame. Client callers only — never passed from a server page. */
  format?: (n: number) => string;
  tone?: string;
  unitTone?: string;
  size?: number;
  className?: string;
  duration?: number;
}) {
  const fmt = format ?? (money ? formatCents : (n: number) => String(Math.round(n)));
  // Initial state matches SSR: the final, formatted value. Hydration sees no diff.
  const [shown, setShown] = useState(value);
  const raf = useRef<number | null>(null);

  useEffect(() => {
    const reduce =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduce || value === 0) {
      setShown(value);
      return;
    }
    const start = performance.now();
    const from = 0;
    const tick = (now: number) => {
      const t = Math.min((now - start) / duration, 1);
      setShown(from + (value - from) * easeOutExpo(t));
      if (t < 1) raf.current = requestAnimationFrame(tick);
    };
    setShown(0);
    raf.current = requestAnimationFrame(tick);
    return () => {
      if (raf.current) cancelAnimationFrame(raf.current);
    };
  }, [value, duration]);

  const [unit, digits] = splitUnit(fmt(shown));
  return (
    <span
      className={cn("mono font-bold leading-none tabular-nums", className)}
      style={{ color: tone || "var(--ink)", fontSize: size, letterSpacing: "-0.03em" }}
    >
      {unit && <span style={{ color: unitTone, fontSize: size * 0.62 }}>{unit}</span>}
      {digits}
    </span>
  );
}

/* --------------------------------------------------------------------------
   SPARKLINE — a week's trend at a glance.
   A hairline area under one accent stroke, an end dot on the current period,
   and a faint baseline the line rides on. No axes, no grid, no numbers — the
   figure beside it carries the value; this carries only the shape.
   -------------------------------------------------------------------------- */
export function Sparkline({
  values,
  tone = "var(--sky)",
  width = 128,
  height = 34,
  className,
  ariaLabel,
  animate = true,
}: {
  values: number[];
  tone?: string;
  width?: number;
  height?: number;
  className?: string;
  ariaLabel?: string;
  animate?: boolean;
}) {
  const pad = 3;
  const w = width;
  const h = height;
  const n = values.length;

  // A single reading, or none, is not a trend — draw the baseline and stop.
  const flat = n < 2;
  const min = flat ? 0 : Math.min(...values);
  const max = flat ? 1 : Math.max(...values);
  const span = max - min || 1;

  const x = (i: number) => pad + (i / Math.max(n - 1, 1)) * (w - 2 * pad);
  // A flat series sits on the mid-line rather than pinning to the floor or ceiling.
  const y = (v: number) =>
    span === 0 ? h / 2 : h - pad - ((v - min) / span) * (h - 2 * pad);

  const pts = values.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`);
  const line = flat ? "" : `M${pts.join("L")}`;
  const area = flat
    ? ""
    : `M${x(0).toFixed(1)},${(h - pad).toFixed(1)}L${pts.join("L")}L${x(n - 1).toFixed(
        1
      )},${(h - pad).toFixed(1)}Z`;

  const lastX = flat ? w - pad : x(n - 1);
  const lastY = flat ? h / 2 : y(values[n - 1]);

  const trend =
    ariaLabel ??
    (flat
      ? "Trend, not enough data"
      : `Trend, ${values[n - 1] >= values[0] ? "up" : "down"} over ${n} periods`);

  return (
    <svg
      className={className}
      width={w}
      height={h}
      viewBox={`0 0 ${w} ${h}`}
      preserveAspectRatio="none"
      role="img"
      aria-label={trend}
      style={{ display: "block", overflow: "visible" }}
    >
      {/* The floor the trend rides on — ground, not structure, so it stays hairline. */}
      <line
        x1={pad}
        y1={h - pad}
        x2={w - pad}
        y2={h - pad}
        stroke="var(--line)"
        strokeWidth={1}
        vectorEffect="non-scaling-stroke"
      />
      {area && <path d={area} fill={tone} fillOpacity={0.1} />}
      {line && (
        <path
          d={line}
          fill="none"
          stroke={tone}
          strokeWidth={1.75}
          strokeLinejoin="round"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
          // Normalised so the draw-in reads as one pass whatever the real path length.
          pathLength={100}
          className={animate ? "spark-draw" : undefined}
        />
      )}
      {/* The one marker: where the series is now. */}
      <circle cx={lastX} cy={lastY} r={2.4} fill={tone} />
      <circle cx={lastX} cy={lastY} r={4.2} fill={tone} fillOpacity={0.18} />
    </svg>
  );
}

/* --------------------------------------------------------------------------
   METERBAR — a proportion, read as one bar.
   A recessed track with the segments laid on it, separated by a 2px reveal of
   the track so two adjacent fills never merge into one. Zero radius; the fill
   is a machined block, not a lozenge.
   -------------------------------------------------------------------------- */
export interface MeterSegment {
  value: number;
  tone: string;
  label?: string;
}

export function MeterBar({
  segments,
  height = 8,
  track = "var(--sunk)",
  className,
  ariaLabel,
}: {
  segments: MeterSegment[];
  height?: number;
  track?: string;
  className?: string;
  ariaLabel?: string;
}) {
  const total = segments.reduce((s, x) => s + Math.max(x.value, 0), 0);
  const live = segments.filter((s) => s.value > 0);
  return (
    <div
      className={cn("flex w-full", className)}
      style={{ height, background: track, gap: 2 }}
      role="img"
      aria-label={ariaLabel}
    >
      {total > 0 &&
        live.map((s, i) => (
          <div
            key={i}
            title={s.label}
            style={{
              // A hair of the track shows between fills; the widths still sum true.
              flexGrow: s.value,
              flexBasis: 0,
              minWidth: 3,
              background: s.tone,
            }}
          />
        ))}
    </div>
  );
}

/* --------------------------------------------------------------------------
   AGINGBAR — MeterBar wearing the receivables ledger's meaning.
   Money owed, split by how late it is: on-terms in neutral slate, then the
   escalation the chase ladder already uses — amber inside the month, rose past
   it. Cents in (the unit is in the name); an optional label row spells each band
   so the two most-severe bands are told apart by their figure, not by hue alone.
   -------------------------------------------------------------------------- */
export interface AgingBuckets {
  /** Owed but not yet past due — money on the street, on terms. */
  currentCents: number;
  d1to30Cents: number;
  d31to60Cents: number;
  d60plusCents: number;
}

const AGING_TONES = {
  current: "var(--slate)",
  d1to30: "var(--amber)",
  d31to60: "var(--rose)",
  d60plus: "var(--rose)",
} as const;

export function AgingBar({
  buckets,
  height = 10,
  showLabels = false,
  className,
}: {
  buckets: AgingBuckets;
  height?: number;
  showLabels?: boolean;
  className?: string;
}) {
  const rows: Array<{ key: string; label: string; cents: number; tone: string }> = [
    { key: "current", label: "On terms", cents: buckets.currentCents, tone: AGING_TONES.current },
    { key: "d1to30", label: "1–30 late", cents: buckets.d1to30Cents, tone: AGING_TONES.d1to30 },
    { key: "d31to60", label: "31–60", cents: buckets.d31to60Cents, tone: AGING_TONES.d31to60 },
    { key: "d60plus", label: "60+", cents: buckets.d60plusCents, tone: AGING_TONES.d60plus },
  ];
  const total = rows.reduce((s, r) => s + Math.max(r.cents, 0), 0);
  return (
    <div className={className}>
      <MeterBar
        height={height}
        segments={rows.map((r) => ({ value: r.cents, tone: r.tone, label: r.label }))}
        ariaLabel="Owing by age"
      />
      {showLabels && (
        <div className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1.5">
          {rows
            .filter((r) => r.cents > 0)
            .map((r) => (
              <span key={r.key} className="inline-flex items-center gap-1.5">
                <span
                  aria-hidden
                  className="inline-block h-2 w-2 shrink-0"
                  style={{ background: r.tone }}
                />
                <span className="eyebrow">{r.label}</span>
                <span className="mono t-meta tabular-nums text-ink-2">{formatCents(r.cents)}</span>
              </span>
            ))}
          {total === 0 && <span className="eyebrow">Nothing on the street</span>}
        </div>
      )}
    </div>
  );
}

/* --------------------------------------------------------------------------
   STATTILE — the command-bridge readout.
   A raised plate on the deck: an eyebrow, a counting gauge, and a foot that
   holds whatever the number is worth reading against — a sparkline, a meter, a
   line of context. The lamp marks the one tile that needs a hand today; the
   whole plate is the tap target.
   -------------------------------------------------------------------------- */
export function StatTile({
  label,
  value,
  money = false,
  format,
  tone,
  unit,
  suffix,
  lamp,
  href,
  foot,
  armIndex,
  numberSize = 30,
  className,
}: {
  label: string;
  value: number;
  /** Print the figure as money (`formatCents`). The one flag a server page may set. */
  money?: boolean;
  format?: (n: number) => string;
  /** Colour of the digits — a hue only where it means something (owing rose, in emerald). */
  tone?: string;
  /** Small neutral unit mark shown before the number when the format carries none. */
  unit?: string;
  /** Small trailing note beside the number, e.g. `/ 5`. */
  suffix?: React.ReactNode;
  /** The amber attention lamp — the one tile with work waiting. */
  lamp?: boolean;
  href?: string;
  foot?: React.ReactNode;
  armIndex?: number;
  numberSize?: number;
  className?: string;
}) {
  const inner = (
    <>
      <div className="flex items-center gap-2">
        {lamp && (
          <span
            aria-hidden
            className="inline-block h-1.5 w-1.5 shrink-0 rounded-full"
            style={{ background: "var(--amber)" }}
          />
        )}
        <span className="eyebrow group-hover:text-ink">{label}</span>
      </div>
      <div className="mt-3 flex items-baseline gap-1.5">
        {unit && (
          <span
            className="mono font-bold leading-none"
            style={{ color: "var(--ink-3)", fontSize: numberSize * 0.62 }}
          >
            {unit}
          </span>
        )}
        <CountUp value={value} money={money} format={format} tone={tone} size={numberSize} />
        {suffix && <span className="mono t-meta text-ink-3">{suffix}</span>}
      </div>
      {foot && <div className="mt-3.5 border-t border-line pt-3">{foot}</div>}
    </>
  );

  const style =
    armIndex !== undefined
      ? ({ ["--i" as string]: armIndex } as React.CSSProperties)
      : undefined;
  const cls = cn(
    "plate group block px-4 py-3.5 transition-[border-color,transform] duration-instrument ease-instrument",
    armIndex !== undefined && "arm-readout",
    href && "hover:-translate-y-px hover:border-ink-3",
    className
  );

  return href ? (
    <Link href={href} className={cls} style={style}>
      {inner}
    </Link>
  ) : (
    <div className={cls} style={style}>
      {inner}
    </div>
  );
}

/* --------------------------------------------------------------------------
   BALANCE — the two-sided figure for the finance T-account.
   Money in on the left of the eye, money out mirrored, and the net drawn under
   the accountant's double rule. Emerald in, rose out; the net reports the sign
   of the number, and a flat month reads in neutral ink rather than shouting a
   green or red zero. Cents in — the unit is in the name.
   -------------------------------------------------------------------------- */
export function Balance({
  inCents,
  outCents,
  netCents,
  inLabel = "Money in",
  outLabel = "Money out",
  netLabel = "Net",
  meter = false,
  className,
}: {
  inCents: number;
  outCents: number;
  /** Supply when net is not simply in − out (a carried balance); defaults to the difference. */
  netCents?: number;
  inLabel?: string;
  outLabel?: string;
  netLabel?: string;
  /** Draw the in-vs-out split as a meter above the net. */
  meter?: boolean;
  className?: string;
}) {
  const net = netCents ?? inCents - outCents;
  const netTone =
    net > 0 ? "var(--emerald-ink)" : net < 0 ? "var(--rose-ink)" : "var(--ink)";

  return (
    <div className={cn("mono tabular-nums", className)}>
      <Side label={inLabel} cents={inCents} sign="" tone="var(--emerald-ink)" />
      <Side label={outLabel} cents={outCents} sign="−" tone="var(--rose-ink)" />

      {meter && (
        <MeterBar
          className="mt-3"
          segments={[
            { value: inCents, tone: "var(--emerald)", label: inLabel },
            { value: outCents, tone: "var(--rose)", label: outLabel },
          ]}
          ariaLabel="In against out"
        />
      )}

      <div className="rule-double mt-3 flex items-baseline justify-between gap-4 pt-2.5">
        <span className="eyebrow text-ink">{netLabel}</span>
        <span className="tabular-nums font-bold" style={{ color: netTone, fontSize: 22 }}>
          {net < 0 ? "−" : ""}
          {formatCents(Math.abs(net))}
        </span>
      </div>
    </div>
  );
}

function Side({
  label,
  cents,
  sign,
  tone,
}: {
  label: string;
  cents: number;
  sign: string;
  tone: string;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-1">
      <span className="eyebrow">{label}</span>
      <span className="tabular-nums" style={{ color: cents > 0 ? tone : "var(--ink-3)" }}>
        {sign}
        {formatCents(cents)}
      </span>
    </div>
  );
}
