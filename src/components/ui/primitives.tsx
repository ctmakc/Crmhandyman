import Link from "next/link";
import { cn, formatDate, formatDateTime } from "@/lib/utils";
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
 * The same status word on the NAVY chrome — the rail, the phone's bottom bar, a
 * toast. The deck twins above are darkened for light ground and land at 2.6–3.2:1
 * there, which outdoors is nothing at all. These are opened up instead: 7.7–8.7:1.
 * Amber keeps its own value; it is already the brightest thing on the chrome.
 */
export function railToneFor(status?: string | null) {
  const tone = spineFor(status);
  if (tone === "var(--rose)") return "var(--rose-rail)";
  if (tone === "var(--sky)") return "var(--sky-rail)";
  if (tone === "var(--emerald)") return "var(--emerald-rail)";
  if (tone === "var(--slate)") return "var(--slate-rail)";
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
    /**
     * The action sits beside the title on the desk and under the block on the
     * phone. Side by side at 390px it squeezed the sub-line into three lines and
     * pushed a 155px button against the edge of the screen.
     */
    <div className="flex flex-col items-stretch gap-4 md:flex-row md:items-end md:justify-between md:gap-6">
      <div className="min-w-0">
        <div className="eyebrow">{eyebrow}</div>
        <h1 className="mt-2.5 t-page font-black tracking-[-0.025em] text-ink">
          {title}
        </h1>
        {sub && <p className="measure t-lede mt-3 text-ink-2">{sub}</p>}
      </div>
      {action && <div className="actions shrink-0 md:pb-1.5">{action}</div>}
    </div>
  );
}

/**
 * The way back out of a record. Six record screens had written their own
 * `← ALL JOBS` link, at four different sizes, and the field rule that grows an
 * 11px link to a 44px target only finds it if it carries `.eyebrow`.
 */
export function BackLink({ href, label }: { href: string; label: string }) {
  return (
    <Link href={href} className="eyebrow inline-flex items-center gap-1.5 hover:text-ink">
      <span aria-hidden>←</span>
      {label}
    </Link>
  );
}

/** A section opener: mono label on a rule. Replaces the boxed panel header. */
export function LaneHead({
  title,
  right,
  lamp,
  count,
  unit,
}: {
  title: string;
  right?: React.ReactNode;
  lamp?: string;
  /**
   * How many rows the lane holds. It has ONE place — the right end of the head,
   * in mono, no leading zero. The work board wrote it into the `h2` in caps and
   * a proportional face (`ON THE GO · 2`), the whiteboard padded it to `05`, and
   * everybody else printed a word beside it, so one fact had three shapes.
   */
  count?: number;
  /** The singular noun. `2 invoices`, `1 job`. */
  unit?: string;
}) {
  return (
    /**
     * `right` holds a count on some screens and a search box on others. The head
     * wraps instead of shrinking: at 390px the title used to fold onto two lines
     * ("ON THE GO ·" / "2") to make room for a search field. Now the title keeps
     * its line and anything that does not fit takes the next one.
     */
    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2 pb-2.5">
      <h2 className="t-meta flex shrink-0 items-center gap-2 font-bold uppercase leading-none tracking-[0.1em] text-ink">
        {lamp && (
          <span
            aria-hidden
            className="inline-block h-1.5 w-1.5 shrink-0 rounded-full"
            style={{ background: lamp }}
          />
        )}
        {title}
      </h2>
      {(count !== undefined || right) && (
        <div className="flex min-w-0 flex-wrap items-center gap-3">
          {count !== undefined && (
            <span className="eyebrow shrink-0">
              <Num>{count}</Num>
              {unit ? ` ${count === 1 ? unit : unit + "s"}` : ""}
            </span>
          )}
          {right}
        </div>
      )}
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

/**
 * ANY OTHER NUMBER. Money has `Money`, gauges have `Readout`, and everything
 * else — counts, ages, quantities, percentages, hours, invoice and phone
 * numbers — was falling back to the body face. The audit of 2026-08-13 counted
 * 149 numbers printed in proportional Chivo, where a column of them no longer
 * lines up and a `1` is narrower than a `7`.
 */
export function Num({
  children,
  className,
  tone,
}: {
  children: React.ReactNode;
  className?: string;
  tone?: string;
}) {
  return (
    <span className={cn("mono", className)} style={tone ? { color: tone } : undefined}>
      {children}
    </span>
  );
}

/**
 * A DATE, printed the one way. Eight places called `toLocaleDateString("en-CA")`
 * and printed `2026-07-27` next to a screen that printed `Jul 27, 2026` for the
 * same day. A date is a number, so it is mono like every other number.
 */
export function Stamp({
  date,
  withTime,
  className,
  tone,
}: {
  date: Date | string | null | undefined;
  withTime?: boolean;
  className?: string;
  tone?: string;
}) {
  if (!date) return <span className={cn("mono", className)}>—</span>;
  return (
    <span className={cn("mono", className)} style={tone ? { color: tone } : undefined}>
      {withTime ? formatDateTime(date) : formatDate(date)}
    </span>
  );
}

/**
 * A fact about a record that is not its status — an equipment kind, a source, a
 * tag. Recessed rather than framed: eight hairline rectangles in a row rebuild
 * the box grid that the 2026-07-27 revision took out.
 */
export function Chip({
  children,
  className,
  title,
}: {
  children: React.ReactNode;
  className?: string;
  title?: string;
}) {
  return (
    <span className={cn("chip", className)} title={title}>
      {children}
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
      <h2 className="t-body font-bold uppercase tracking-[0.06em] text-ink">
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
    <span className="mono eyebrow tracking-[0.08em] text-ink-3">
      {docRef(prefix, id, date)}
    </span>
  );
}

/** Buttons: four ranks, one radius, two heights, no gradients. */
export function Button({
  children,
  variant = "primary",
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
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

export type ButtonVariant = "primary" | "ghost" | "danger" | "quiet";

export function buttonClass(variant: ButtonVariant = "primary") {
  /**
   * `min-h-[44px]` below the `md` breakpoint is the whole field-mode promise: the
   * button rendered at 38px, which is a mis-tap with a glove on. The desk keeps
   * its density above `md`.
   *
   * Disabled used to be `opacity-50`, which put the label at 1.9:1 — outdoors a
   * disabled CALL simply vanished instead of reading as unavailable. It is a
   * recessed surface now: legible, and obviously not live.
   *
   * `quiet` is the fourth rank, and it exists because the ranks stopped at three.
   * Screens that needed a row-scale control (the call sheet's CONTACTED / VERIFY /
   * REJECT, the estimate's line actions) each wrote their own, and the desk ended
   * up with buttons at 11, 14, 16, 23, 25, 27, 30, 31, 32, 38, 48 and 54px. This
   * one is the row-scale rank, and it is the last one.
   */
  const base =
    /* The transition names its properties. `transition-all` also animates the
       focus outline, which made the keyboard ring fade in from the button's own
       colour at the browser's own thickness. */
    "inline-flex min-h-[44px] items-center justify-center gap-2 rounded border font-bold uppercase transition-[background-color,border-color,color,transform] duration-fast ease-instrument md:min-h-0 disabled:cursor-not-allowed disabled:border-line disabled:bg-sunk disabled:text-ink-3";
  /**
   * The height is arithmetic, not an accident: 20 of line box + 16 of padding +
   * 2 of border = 38px on the desk, the same 38 as `.control`, so a button and
   * the field beside it sit on one line. The quiet rank works out at 26.
   */
  const deskScale = "t-body px-3.5 py-2 leading-[20px] tracking-[0.05em]";
  if (variant === "primary")
    return cn(
      base,
      deskScale,
      "border-navy-900 bg-navy-900 text-plate hover:bg-navy-800 active:translate-y-px"
    );
  if (variant === "danger")
    return cn(
      base,
      deskScale,
      "border-line bg-plate text-rose hover:border-rose active:translate-y-px"
    );
  if (variant === "quiet")
    return cn(
      base,
      /* `!leading-[16px]`: `.t-micro` is written in `globals.css` AFTER the
         utilities layer, so at equal specificity its `line-height: 1.1` won and
         the rank rendered 21–22px instead of the 26 this comment promises.
         Three separate groups measured the same drift. The bang is the one
         place the rank asserts its own line box. */
      "mono t-micro px-2 py-1 !leading-[16px] tracking-[0.08em]",
      "border-line bg-plate text-ink-2 hover:border-ink-3 hover:text-ink active:translate-y-px"
    );
  return cn(
    base,
    deskScale,
    "border-line bg-plate text-ink-2 hover:border-ink-3 hover:text-ink active:translate-y-px"
  );
}

/**
 * THE CONTROL — every input, select and textarea in the product.
 * Nine screens had copied `w-full mt-1.5 px-3 py-2 text-[13px]` into a local
 * `const field`, and the copies had drifted apart: 32, 34, 38, 39 and 40px tall
 * on the same desk. `Field` hands this down automatically; a bare control that
 * lives outside a `Field` (a search box, a filter) asks for it by name.
 */
export function controlClass(className?: string) {
  return cn("control", className);
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

/**
 * EMPTY IS A STATE, NOT A FAULT.
 *
 * The old version printed one mono line and stopped, so a fresh desk said
 * `NO MONEY IN THIS PERIOD` and left the owner to guess whether that was a
 * result or a broken screen. An empty lane now says what is missing on the
 * first line and what to do about it on the second, and carries the button that
 * does it when there is one.
 *
 * The first line stays in `children` so the twenty-eight existing calls keep
 * working unchanged; `hint` and `action` are what a polished screen adds.
 */
export function Empty({
  children,
  hint,
  action,
  className,
}: {
  children: React.ReactNode;
  /** What the person does next, in his words. One sentence, no full stop needed. */
  hint?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    /* Left, on the row's own indent. Centred, the line broke wherever the column
       happened to end ("NO INVOICES ON THIS / JOB") and read as a poster in the
       middle of a working deck. Everything else here is left-aligned; an empty
       lane is a status line, and status lines start where the rows start. */
    <div
      className={cn("border-t border-line py-7 pl-5 pr-4", className)}
      role="status"
    >
      <p className="eyebrow">{children}</p>
      {hint && <p className="measure t-body mt-2.5 text-ink-2">{hint}</p>}
      {action && <div className="actions mt-4">{action}</div>}
    </div>
  );
}

/**
 * SOMETHING DID NOT WORK.
 *
 * Named, not apologised for: the line says what failed and what the person can
 * do, and it is announced as well as drawn. `Something went wrong` and
 * `Error: undefined` are the two things this exists to keep off the screen.
 */
export function ErrorNote({
  children,
  retry,
  className,
}: {
  /** «That invoice could not be sent — the email address on the client is blank.» */
  children: React.ReactNode;
  retry?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      role="alert"
      className={cn("border-l-2 py-2 pl-3", className)}
      style={{ borderColor: "var(--rose)" }}
    >
      <p className="t-body" style={{ color: "var(--rose-ink)" }}>
        {children}
      </p>
      {retry && <div className="mt-2">{retry}</div>}
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
  /**
   * Receives the id, the description wiring AND the control's own class. Spread
   * the whole object onto the input and add nothing:
   *
   *     <Field id="pay-amount" label="Amount" required error={amountError}>
   *       {(f) => <input {...f} type="number" step="0.01" value={amount}
   *                      onChange={(e) => setAmount(e.target.value)} />}
   *     </Field>
   *
   * A local `className` still wins if it is spelled after the spread, which is
   * how a money field asks for `mono text-right`.
   */
  children: (props: {
    id: string;
    className: string;
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
      <label className="eyebrow block" htmlFor={id}>
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
        className: cn("control mt-1.5", error && "border-rose"),
        "aria-describedby": describedBy,
        "aria-invalid": error ? true : undefined,
        required,
      })}
      {hint && (
        <p id={hintId} className="t-meta mt-1 text-ink-2">
          {hint}
        </p>
      )}
      {/* The message is spoken as well as shown — a red line nobody hears is not
          an error report. It names the field's problem: «Enter an amount above
          zero», never «Invalid input». */}
      {error && (
        <p
          id={errorId}
          role="alert"
          className="mono t-meta mt-1 border-l-2 py-1 pl-2"
          style={{ borderColor: "var(--rose)", color: "var(--rose-ink)" }}
        >
          {error}
        </p>
      )}
    </div>
  );
}

/* --------------------------------------------------------------------------
   TABLES — only two documents in the product are a table (the printed invoice
   and the admin roster). Both were wider than a phone and both lost their right
   hand columns off the edge of the screen. The wrapper gives the box its own
   scroller without depending on the `:has()` rule in globals.css.
   -------------------------------------------------------------------------- */
export function TableWrap({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <div className={cn("w-full overflow-x-auto", className)}>{children}</div>;
}

/** A column heading. `scope` is what tells a screen reader which cells it owns. */
export function Th({
  children,
  className,
  align = "left",
}: {
  children: React.ReactNode;
  className?: string;
  align?: "left" | "right";
}) {
  return (
    <th
      scope="col"
      className={cn(
        "eyebrow whitespace-nowrap border-b border-line px-3 py-2",
        align === "right" ? "text-right" : "text-left",
        className
      )}
    >
      {children}
    </th>
  );
}
