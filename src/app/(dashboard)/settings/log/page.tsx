import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireAdminPage } from "@/lib/page-guard";
import {
  BackLink,
  Empty,
  Num,
  PageHead,
  buttonClass,
  controlClass,
} from "@/components/ui/primitives";

/**
 * THE LOG BOOK — this screen's device (see DESIGN.md rev 3: every screen is a
 * different instrument). A day-stamped shop log: timestamps run down a mono rail on
 * the left, days open on a rule, and each line is one readable sentence. It is read
 * aloud during an argument, so nothing here is a data grid and nothing is editable.
 */

const PAGE_SIZE = 60;

/**
 * Colour means one thing only: emerald money arrived or a job was won, rose something
 * was removed or lost, sky new paper/communication exists, amber a state moved.
 */
const TONE: Record<string, string> = {
  "invoice.issue": "var(--sky)",
  "invoice.pay": "var(--emerald)",
  "invoice.status": "var(--amber)",
  "invoice.void": "var(--rose)",
  "estimate.accept": "var(--emerald)",
  "estimate.reject": "var(--rose)",
  "estimate.status": "var(--sky)",
  "lead.convert": "var(--emerald)",
  "lead.acquisition_cost": "var(--amber)",
  "lead.activity.sms_sent": "var(--sky)",
  "lead.activity.sms_received": "var(--sky)",
  "lead.activity.sms_failed": "var(--rose)",
  "lead.activity.sms_opt_out": "var(--rose)",
  "lead.activity.sms_opt_in": "var(--emerald)",
  "payment.record": "var(--emerald)",
  "payment.delete": "var(--rose)",
  "user.add": "var(--sky)",
  "user.remove": "var(--rose)",
};

const ENTITIES = ["Invoice", "Payment", "Estimate", "Project", "Lead", "User"];

const timeOf = (d: Date) =>
  d.toLocaleTimeString("en-CA", { hour: "2-digit", minute: "2-digit", hour12: false });

const dayOf = (d: Date) =>
  d
    .toLocaleDateString("en-CA", { weekday: "short", day: "2-digit", month: "short", year: "numeric" })
    .replace(/,/g, "")
    .toUpperCase();

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)?.trim() || "";

export default async function ActionLogPage({
  searchParams,
}: {
  searchParams: { [key: string]: string | string[] | undefined };
}) {
  const { tenantId } = await requireAdminPage();

  const q = first(searchParams.q);
  const entity = first(searchParams.entity);
  const cursor = first(searchParams.cursor);

  const rows = await prisma.auditLog.findMany({
    where: {
      tenantId,
      ...(entity ? { entity } : {}),
      ...(q ? { summary: { contains: q } } : {}),
    },
    // id breaks ties so two entries written in the same millisecond cannot swap pages.
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: PAGE_SIZE + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
  });

  const hasMore = rows.length > PAGE_SIZE;
  const entries = hasMore ? rows.slice(0, PAGE_SIZE) : rows;

  // Days in the order they were read — the log runs newest first and stays that way.
  const days: { label: string; entries: typeof entries }[] = [];
  for (const entry of entries) {
    const label = dayOf(entry.createdAt);
    const open = days[days.length - 1];
    if (open?.label === label) open.entries.push(entry);
    else days.push({ label, entries: [entry] });
  }

  const today = dayOf(new Date());
  const filters = new URLSearchParams();
  if (q) filters.set("q", q);
  if (entity) filters.set("entity", entity);
  const olderHref = `/settings/log?${new URLSearchParams({
    ...Object.fromEntries(filters),
    cursor: entries.length ? entries[entries.length - 1].id : "",
  })}`;
  const newestHref = `/settings/log${filters.toString() ? `?${filters}` : ""}`;

  return (
    <div className="page-doc space-y-6 pb-24 md:pb-0">
      <BackLink href="/settings" label="Settings" />

      <PageHead
        eyebrow="Desk setup · 10"
        title="Action log"
        sub="Every change to money, paper, access and lead communication, in the order it happened. Entries are written once and never edited."
      />

      {/* Ruled filter line — a frame is the last resort, and this one has not earned it. */}
      <form method="GET" className="flex flex-wrap items-end gap-2 border-b border-line pb-3">
        <div className="w-full sm:w-[260px]">
          <label className="eyebrow block" htmlFor="log-q">
            Search
          </label>
          <input
            id="log-q"
            name="q"
            defaultValue={q}
            placeholder="A name, a job, an amount"
            className={controlClass("mt-1.5")}
          />
        </div>
        <div>
          <label className="eyebrow block" htmlFor="log-entity">
            What changed
          </label>
          <select
            id="log-entity"
            name="entity"
            defaultValue={entity}
            className={controlClass("mono mt-1.5 w-[190px]")}
          >
            <option value="">Everything</option>
            {ENTITIES.map((e) => (
              <option key={e} value={e}>
                {e}
              </option>
            ))}
          </select>
        </div>
        <button type="submit" className={buttonClass("ghost")}>
          Filter
        </button>
        {(q || entity || cursor) && (
          <Link href="/settings/log" className={buttonClass("quiet")}>
            Clear
          </Link>
        )}
      </form>

      {entries.length === 0 && (
        <Empty
          hint={
            q || entity
              ? "Nothing here answers that. Clear the filter to read the whole book."
              : "The log fills itself. Issue an invoice, take a payment, text a lead or add a crew member and the entry appears here with a name and a time against it."
          }
        >
          {q || entity ? "No entries match" : "Nothing recorded yet"}
        </Empty>
      )}

      {days.map((day) => (
        <section key={day.label}>
          <div className="flex items-baseline justify-between gap-4 border-b border-line pb-2">
            <h2 className="mono t-meta font-bold uppercase tracking-[0.1em] text-ink">
              {day.label === today ? `Today · ${day.label}` : day.label}
            </h2>
            <span className="eyebrow">
              <Num>{day.entries.length}</Num> {day.entries.length === 1 ? "entry" : "entries"}
            </span>
          </div>

          {day.entries.map((entry) => (
            <div
              key={entry.id}
              className="row"
              style={
                { ["--spine" as string]: TONE[entry.action] || "var(--slate)" } as React.CSSProperties
              }
            >
              {/* The rail lives on an inner element: `.row` declares display:block and
                  wins over a utility class, which would flatten the timestamp column. */}
              <div className="flex gap-3 sm:gap-4">
                <time
                  dateTime={entry.createdAt.toISOString()}
                  className="mono t-meta w-[42px] shrink-0 pt-px text-ink-3"
                >
                  {timeOf(entry.createdAt)}
                </time>
                <div className="min-w-0">
                  <p className="measure t-body leading-snug text-ink">{entry.summary}</p>
                  <p className="eyebrow mt-1.5">
                    {entry.actorName} · {entry.action}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </section>
      ))}

      {(hasMore || cursor) && (
        <div className="flex items-center justify-between gap-4 border-t border-line pt-3">
          {cursor ? (
            <Link href={newestHref} className="eyebrow hover:text-ink">
              ↑ Newest
            </Link>
          ) : (
            <span />
          )}
          {hasMore && (
            <Link href={olderHref} className="eyebrow hover:text-ink">
              Older →
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
