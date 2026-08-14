import Link from "next/link";
import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma";
import { authOptions } from "@/lib/auth";
import { sessionTenant } from "@/lib/session";
import { LaneHead, Money, Num } from "@/components/ui/primitives";
import { chaseStage, daysOverdue, isOverdue, lateTail, owingCents } from "@/lib/invoice-state";

/**
 * The chase lane — money already earned and not yet in the bank. This is the one thing
 * an owner opens the CRM for, so it may only ever say true things.
 *
 * The desk hands over the invoices it decided to show; the lane reads them back out of
 * the ledger under its own tenant scope and keeps the ones that are STILL late by the
 * calendar and STILL owed after every payment, part-payments included. A lane carrying
 * a settled invoice is a lane the owner stops believing, and after that the real one
 * goes unread too.
 *
 * Two bands, because there are two ways to collect. An invoice with an address is
 * chased by the reminder button. An invoice without one used to answer "no email on
 * file" and die there — and that is the normal case here, since both quiz landings
 * collect a phone number and nothing else. Those go to a call band with everything the
 * dispatcher needs to dial without opening another screen.
 */
export default async function ChaseLane({ invoices }: { invoices: { id: string }[] }) {
  const ids = invoices.map((i) => i.id);
  if (!ids.length) return null;

  const session = await getServerSession(authOptions);
  if (!session) return null;
  const { tenantId } = sessionTenant(session);

  const rows = (
    await prisma.invoice.findMany({
      // An id list from a caller is a suggestion, never a permission — the scope is
      // the session's, exactly as it is on every other read of this table.
      where: { tenantId, id: { in: ids }, status: { in: ["SENT", "PARTIAL"] } },
      include: {
        payments: { select: { amountCents: true } },
        project: { select: { title: true, phone: true } },
      },
    })
  )
    .map((inv) => {
      const state = {
        status: inv.status,
        totalCents: inv.totalCents,
        dueDate: inv.dueDate,
        amountPaidCents: inv.payments.reduce((s, p) => s + p.amountCents, 0),
      };
      return {
        id: inv.id,
        number: inv.number,
        clientName: inv.clientName,
        email: inv.email,
        phone: inv.project.phone,
        job: inv.project.title,
        owingCents: owingCents(state),
        days: daysOverdue(state),
        stage: chaseStage(state),
        overdue: isOverdue(state),
      };
    })
    .filter((r) => r.overdue)
    .sort((a, b) => b.days - a.days);

  const byMail = rows.filter((r) => r.email);
  const byPhone = rows.filter((r) => !r.email);
  if (!rows.length) return null;

  return (
    <>
      {byMail.length > 0 && (
        <section>
          <LaneHead
            title="Chase list"
            lamp="var(--rose)"
            right={
              <Link href="/invoices?status=overdue" className="eyebrow hover:text-ink">
                All →
              </Link>
            }
          />
          <div className="lane">
            {byMail.map((r) => (
              <Link
                key={r.id}
                href={`/invoices/${r.id}`}
                className="row"
                style={{ ["--spine" as string]: spineOf(r.stage?.level) } as React.CSSProperties}
              >
                <Head number={r.number} days={r.days} level={r.stage?.level} />
                <Amount name={r.clientName} owingCents={r.owingCents} level={r.stage?.level} />
                <p className="t-meta mt-1 truncate text-ink-2">{r.stage?.hint}</p>
              </Link>
            ))}
          </div>
        </section>
      )}

      {byPhone.length > 0 && (
        <section>
          {/* Rose again, and no second "All →": these are the same debts as the band
              above, sorted by how they get collected. Amber is the live-job lamp and
              the deck already spends its three. */}
          <LaneHead title="Chase by hand · no email on file" lamp="var(--rose)" />
          <div className="lane">
            {byPhone.map((r) => (
              /* The row opens the invoice through a stretched link so the phone below
                 stays a real anchor — an <a> inside an <a> breaks hydration. */
              <div
                key={r.id}
                className="row row-hover"
                style={{ ["--spine" as string]: spineOf(r.stage?.level) } as React.CSSProperties}
              >
                <Link
                  href={`/invoices/${r.id}`}
                  className="absolute inset-0"
                  aria-label={`Open ${r.number}`}
                />
                <Head number={r.number} days={r.days} level={r.stage?.level} />
                <Amount name={r.clientName} owingCents={r.owingCents} level={r.stage?.level} />
                <p className="t-meta mt-1 truncate text-ink-2">{r.job}</p>
                {r.phone ? (
                  <a
                    href={`tel:${r.phone}`}
                    className="mono t-row relative z-[1] mt-1.5 inline-block font-medium text-ink underline underline-offset-4 hover:text-sky-ink"
                  >
                    {r.phone}
                  </a>
                ) : (
                  <p className="eyebrow mt-1.5">No phone on file</p>
                )}
              </div>
            ))}
          </div>
        </section>
      )}
    </>
  );
}

/** Neutral while the first week runs out; rose once the ladder starts — see CHASE_LADDER. */
function spineOf(level: number | undefined) {
  return level ? "var(--rose)" : "var(--slate)";
}

/** The lateness tally goes quiet before day 7; the amount never does — it is the point. */
function toneOf(level: number | undefined) {
  return level ? "var(--rose-ink)" : "var(--ink-3)";
}

function moneyToneOf(level: number | undefined) {
  return level ? "var(--rose-ink)" : "var(--ink)";
}

function Head({ number, days, level }: { number: string; days: number; level?: number }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="eyebrow font-bold text-ink-2">{number}</span>
      <span className="eyebrow" style={{ color: toneOf(level) }}>
        <Num>{days}</Num> {lateTail(days)}
      </span>
    </div>
  );
}

function Amount({
  name,
  owingCents,
  level,
}: {
  name: string;
  owingCents: number;
  level?: number;
}) {
  return (
    <div className="mt-1 flex items-baseline justify-between gap-3">
      <p className="t-row truncate font-bold text-ink">{name}</p>
      <Money cents={owingCents} tone={moneyToneOf(level)} className="t-row shrink-0" />
    </div>
  );
}
