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
  return tone === "var(--amber)" ? "var(--amber-ink)" : tone;
}

/** Page header: mono eyebrow over a heavy display line. No decorative badge. */
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
    <div className="flex items-start justify-between gap-4 border-b border-line pb-4">
      <div>
        <div className="eyebrow">{eyebrow}</div>
        <h1 className="mt-2 text-[28px] font-black leading-none tracking-tight text-ink md:text-[34px]">
          {title}
        </h1>
        {sub && <p className="mt-2 text-sm text-ink-2">{sub}</p>}
      </div>
      {action && <div className="shrink-0 pt-1">{action}</div>}
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
 * THE TICKET — the signature primitive. Status spine on the left edge, punched
 * notch on the bottom, mono work-order number. Renders as a link when href given.
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

/** Empty state — a recessed lane, not an illustration. */
export function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div className="border border-dashed border-line bg-sunk px-4 py-10 text-center">
      <p className="eyebrow">{children}</p>
    </div>
  );
}
