import Link from "next/link";
import { cn, formatCurrency } from "@/lib/utils";

/* ==========================================================================
   «НАРЯД» primitives. Everything in the product is assembled from these.
   Colour comes from tokens only — see DESIGN.md.
   ========================================================================== */

/** Semantic status -> spine colour token. A colour here always means something. */
export const SPINE: Record<string, string> = {
  NEW: "var(--amber)",
  CONTACTED: "var(--sky)",
  QUALIFIED: "var(--sky)",
  CONVERTED: "var(--emerald)",
  REJECTED: "var(--slate)",
  LOST: "var(--slate)",

  SCHEDULED: "var(--sky)",
  IN_PROGRESS: "var(--amber)",
  COMPLETED: "var(--emerald)",
  CANCELLED: "var(--rose)",

  TODO: "var(--slate)",
  DONE: "var(--emerald)",

  DRAFT: "var(--slate)",
  SENT: "var(--sky)",
  ACCEPTED: "var(--emerald)",
  DECLINED: "var(--rose)",
  PAID: "var(--emerald)",
  PARTIAL: "var(--amber)",
  OVERDUE: "var(--rose)",
  VOID: "var(--slate)",
};

export function spineFor(status?: string | null) {
  return (status && SPINE[status]) || "var(--slate)";
}

/**
 * The spine colour is a 4px bar — amber is legible there. As TEXT on a light
 * plate, amber fails WCAG, so status labels use the darkened amber-ink instead.
 */
export function textToneFor(status?: string | null) {
  const tone = spineFor(status);
  if (tone === "var(--amber)") return "var(--amber-ink)";
  if (tone === "var(--rose)") return "var(--rose-ink)";
  if (tone === "var(--sky)") return "var(--sky-ink)";
  if (tone === "var(--emerald)") return "var(--emerald-ink)";
  return tone;
}

/**
 * Page header. The display size carries the hierarchy the old 28px could not —
 * the title has to outweigh every number on the deck, or nothing dominates.
 */
export function PageHead({
  eyebrow,
  title,
  sub,
  action,
}: {
  eyebrow: string;
  title: string;
  sub?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex items-end justify-between gap-6">
      <div>
        <div className="eyebrow">{eyebrow}</div>
        <h1 className="mt-2.5 text-[34px] font-black leading-[0.92] tracking-[-0.025em] text-ink md:text-[44px]">
          {title}
        </h1>
        {sub && <p className="mt-3 max-w-[54ch] text-[14px] text-ink-2">{sub}</p>}
      </div>
      {action && <div className="shrink-0 pb-1.5">{action}</div>}
    </div>
  );
}

/** A section opener: mono label on a rule. Replaces the boxed panel header. */
export function LaneHead({
  title,
  right,
  lamp,
}: {
  title: string;
  right?: React.ReactNode;
  lamp?: string;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4 pb-2.5">
      <h2 className="flex items-center gap-2 text-[12px] font-bold uppercase tracking-[0.1em] text-ink">
        {lamp && (
          <span
            className="inline-block h-1.5 w-1.5 rounded-full"
            style={{ background: lamp }}
          />
        )}
        {title}
      </h2>
      {right}
    </div>
  );
}

/** The status chip: a mono label under a spine, never a pastel pill. */
export function Status({ value, tone }: { value: string; tone?: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        className="inline-block h-2 w-2 rounded-full"
        style={{ background: tone || spineFor(value) }}
      />
      <span className="eyebrow" style={{ color: "var(--ink-2)" }}>
        {value.replace(/_/g, " ")}
      </span>
    </span>
  );
}

/** Money is always Chivo Mono, tabular, right-aligned. */
export function Money({
  value,
  className,
  tone,
}: {
  value: number;
  className?: string;
  tone?: string;
}) {
  return (
    <span
      className={cn("mono font-medium tabular-nums", className)}
      style={tone ? { color: tone } : undefined}
    >
      {formatCurrency(value)}
    </span>
  );
}

/** The plate: a flat surface with a hairline. No shadow, radius 3. */
export function Plate({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <div className={cn("plate", className)}>{children}</div>;
}

export function PlateHead({
  title,
  right,
}: {
  title: string;
  right?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between border-b border-line px-4 py-3">
      <h2 className="text-[13px] font-bold uppercase tracking-[0.06em] text-ink">
        {title}
      </h2>
      {right}
    </div>
  );
}

/**
 * THE ROW — the default list primitive. Spine + rule + air, no frame.
 *
 * v1 gave every list item a closed border and the deck read as a stack of
 * identical boxes. The spine survives because it is the one carrier of state;
 * the rectangle does not.
 */
export function Row({
  href,
  status,
  className,
  children,
}: {
  href?: string;
  status?: string | null;
  className?: string;
  children: React.ReactNode;
}) {
  const style = { ["--spine" as string]: spineFor(status) } as React.CSSProperties;
  const cls = cn("row", className);
  return href ? (
    <Link href={href} className={cls} style={style}>
      {children}
    </Link>
  ) : (
    <div className={cn(cls, "row-hover")} style={style}>
      {children}
    </div>
  );
}

/** A ruled lane of rows. Opens with a rule instead of closing in a box. */
export function Lane({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <div className={cn("lane", className)}>{children}</div>;
}

/**
 * THE TICKET PLATE — reserved for documents and record headers, where the closed
 * frame means "a piece of paper you could hold". Not for list items.
 */
export function Ticket({
  href,
  status,
  className,
  children,
}: {
  href?: string;
  status?: string | null;
  className?: string;
  children: React.ReactNode;
}) {
  const style = { ["--spine" as string]: spineFor(status) } as React.CSSProperties;
  const cls = cn("ticket block px-4 py-3", className);
  return href ? (
    <Link href={href} className={cls} style={style}>
      {children}
    </Link>
  ) : (
    <div className={cn(cls, "ticket-hover")} style={style}>
      {children}
    </div>
  );
}

/** Work-order number. Derived from the record id so it is stable and printable. */
export function WoNumber({
  id,
  prefix = "WO",
  date,
}: {
  id: string;
  prefix?: string;
  date?: Date | string | null;
}) {
  const year = date ? new Date(date).getFullYear() : new Date().getFullYear();
  const tail = id.slice(-4).toUpperCase();
  return (
    <span className="mono text-[11px] tracking-[0.08em] text-ink-3">
      {prefix}-{year}-{tail}
    </span>
  );
}

/** Buttons: three ranks, one radius, no gradients. */
export function Button({
  children,
  variant = "primary",
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "ghost" | "danger";
}) {
  return (
    <button
      {...props}
      className={cn(buttonClass(variant), className)}
    >
      {children}
    </button>
  );
}

export function buttonClass(variant: "primary" | "ghost" | "danger" = "primary") {
  const base =
    "inline-flex items-center justify-center gap-2 rounded border px-3.5 py-2 text-[13px] font-bold uppercase tracking-[0.05em] transition-all duration-[140ms] ease-instrument disabled:opacity-50";
  if (variant === "primary")
    return cn(
      base,
      "border-navy-900 bg-navy-900 text-plate hover:bg-navy-800 active:translate-y-px"
    );
  if (variant === "danger")
    return cn(base, "border-line bg-plate text-rose hover:border-rose active:translate-y-px");
  return cn(
    base,
    "border-line bg-plate text-ink-2 hover:border-ink-3 hover:text-ink active:translate-y-px"
  );
}

/**
 * Loading skeleton. A bare "Loading…" on an empty deck reads as a broken page; ruled
 * placeholder rows read as "the desk is still fetching".
 */
export function Skeleton({ lines = 4 }: { lines?: number }) {
  return (
    <div className="lane" aria-busy="true" aria-label="Loading">
      {Array.from({ length: lines }).map((_, i) => (
        <div key={i} className="row">
          <div className="h-2 w-[86px] animate-pulse bg-sunk" />
          <div className="mt-2.5 h-3.5 w-[45%] animate-pulse bg-sunk" />
          <div className="mt-2 h-2.5 w-[62%] animate-pulse bg-sunk" />
        </div>
      ))}
    </div>
  );
}

/** Empty state — a quiet line on the deck, not a dashed box. */
export function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div className="border-t border-line py-9 text-center">
      <p className="eyebrow">{children}</p>
    </div>
  );
}
