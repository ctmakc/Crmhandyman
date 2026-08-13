import Link from "next/link";
import { cn } from "@/lib/utils";
import { formatCents } from "@/lib/money";
import { docRef } from "@/lib/document";

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
  if (tone === "var(--slate)") return "var(--slate-ink)";
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

/**
 * A gauge readout. The currency symbol is a unit mark — it recedes so the digits
 * carry the weight, the way a dial reads "12.4" and prints "PSI" small.
 *
 * The recede is carried by size and by a neutral tone. It used to be carried by
 * `opacity: .45`, which put the dollar sign at 1.9:1 on the deck — no opacity below
 * 1 gets a rose or emerald readout to AA, so the unit mark keeps its own ink
 * instead. The digits still hold the semantic colour, which is the point.
 */
export function Readout({
  value,
  size = 30,
  tone,
  unitTone = "var(--ink-3)",
  className,
}: {
  value: string;
  size?: number;
  tone?: string;
  unitTone?: string;
  className?: string;
}) {
  const m = value.match(/^([^\d\-]*)(.*)$/);
  const unit = m?.[1] ?? "";
  const digits = m?.[2] ?? value;
  return (
    <span
      className={cn("mono font-bold leading-none", className)}
      style={{ color: tone || "var(--ink)", fontSize: size, letterSpacing: "-0.03em" }}
    >
      {unit && <span style={{ color: unitTone, fontSize: size * 0.62 }}>{unit}</span>}
      {digits}
    </span>
  );
}

/**
 * Money is always Chivo Mono, tabular, right-aligned — and always cents. The prop is
 * named for its unit: a screen that hands it dollars prints a hundredth of the bill.
 */
export function Money({
  cents,
  className,
  tone,
}: {
  cents: number;
  className?: string;
  tone?: string;
}) {
  return (
    <span
      className={cn("mono font-medium tabular-nums", className)}
      style={tone ? { color: tone } : undefined}
    >
      {formatCents(cents)}
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
  return (
    <span className="mono text-[11px] tracking-[0.08em] text-ink-3">
      {docRef(prefix, id, date)}
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
  /**
   * `min-h-[44px]` below the `md` breakpoint is the whole field-mode promise: the
   * button rendered at 38px, which is a mis-tap with a glove on. The desk keeps
   * its density above `md`.
   *
   * Disabled used to be `opacity-50`, which put the label at 1.9:1 — outdoors a
   * disabled CALL simply vanished instead of reading as unavailable. It is a
   * recessed surface now: legible, and obviously not live.
   */
  const base =
    "inline-flex min-h-[44px] items-center justify-center gap-2 rounded border px-3.5 py-2 text-[13px] font-bold uppercase tracking-[0.05em] transition-all duration-[140ms] ease-instrument md:min-h-0 disabled:cursor-not-allowed disabled:border-line disabled:bg-sunk disabled:text-ink-3";
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
 * The same "not live" look for something that is not a `<button>`.
 *
 * `disabled:` only fires on a form control, so an `<a>` or a `<span>` dressed as a button
 * never got the recessed treatment above and kept the old `opacity-40` — 1.9:1, which
 * outdoors means the CALL button on the field board simply is not there. The field
 * screen has both: a dead `tel:` link and a finished job's DONE badge.
 */
export const inertLook = "pointer-events-none border-line bg-sunk text-ink-3";

/**
 * Loading skeleton. A bare "Loading…" on an empty deck reads as a broken page; ruled
 * placeholder rows read as "the desk is still fetching".
 */
export function Skeleton({ lines = 4 }: { lines?: number }) {
  return (
    /* `aria-label` on a plain div is dropped by most screen readers; `role="status"`
       plus real text is what actually says "the desk is still fetching". */
    <div className="lane" role="status" aria-busy="true">
      <span className="sr-only">Loading…</span>
      {Array.from({ length: lines }).map((_, i) => (
        <div key={i} className="row" aria-hidden>
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
    <div className="border-t border-line py-9 text-center" role="status">
      <p className="eyebrow">{children}</p>
    </div>
  );
}

/* --------------------------------------------------------------------------
   FORMS — the label has to belong to the field.
   Every form in the product writes `<label class="eyebrow">Amount</label>` next
   to an input and nothing joins the two: the label is decoration, the tap on it
   does nothing, and a screen reader announces "edit text, blank". Field does the
   joining once. New and touched forms should use it; docs/A11Y.md carries the
   list of the ones still to convert.
   -------------------------------------------------------------------------- */
export function Field({
  id,
  label,
  required,
  hint,
  error,
  children,
  className,
}: {
  /** Explicit and stable: a generated one would differ between server and client. */
  id: string;
  label: string;
  required?: boolean;
  hint?: string;
  error?: string;
  /** Receives the id and the description wiring; spread them onto the control. */
  children: (props: {
    id: string;
    "aria-describedby"?: string;
    "aria-invalid"?: boolean;
    required?: boolean;
  }) => React.ReactNode;
  className?: string;
}) {
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(" ") || undefined;
  return (
    <div className={className}>
      <label className="eyebrow" htmlFor={id}>
        {label}
        {required && (
          <>
            {" "}
            <span aria-hidden>*</span>
            <span className="sr-only">(required)</span>
          </>
        )}
      </label>
      {children({
        id,
        "aria-describedby": describedBy,
        "aria-invalid": error ? true : undefined,
        required,
      })}
      {hint && (
        <p id={hintId} className="mt-1 text-[12px] text-ink-2">
          {hint}
        </p>
      )}
      {/* The message is spoken as well as shown — a red line nobody hears is not
          an error report. */}
      {error && (
        <p
          id={errorId}
          role="alert"
          className="mono mt-1 border-l-2 py-1 pl-2 text-[12px]"
          style={{ borderColor: "var(--rose)", color: "var(--rose-ink)" }}
        >
          {error}
        </p>
      )}
    </div>
  );
}
