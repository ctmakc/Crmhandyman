import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { formatCents } from "@/lib/money";
import Link from "next/link";
import {
  PageHead,
  LaneHead,
  Lane,
  Row,
  WoNumber,
  Empty,
  Readout,
  buttonClass,
  textToneFor,
} from "@/components/ui/primitives";
import DayRail from "@/components/DayRail";
import { LeadWait } from "@/components/LeadClock";
import ChaseLane from "@/components/ChaseLane";
import ServiceDueLane from "@/components/ServiceDueLane";
import { nextDueVisit, daysUntil } from "@/lib/contracts";
import { sessionTenant } from "@/lib/session";
import { redirect } from "next/navigation";

export default async function DashboardPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  // Every query below carries this. Without it the desk aggregated the whole platform:
  // one contractor's dashboard showed every other contractor's leads, jobs, revenue and
  // overdue clients by name.
  const { tenantId, id: userId, role } = sessionTenant(session);
  const isAdmin = role === "ADMIN";

  const weekStart = new Date();
  weekStart.setHours(0, 0, 0, 0);
  weekStart.setDate(weekStart.getDate() - weekStart.getDay());
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 7);

  // One wave, not four. The crew count and the contract book used to be awaited after
  // this block finished, so the desk paid three round trips end to end for answers that
  // depend on nothing.
  const [
    newLeadsCount,
    activeProjectsCount,
    pendingTasksCount,
    recentLeads,
    recentProjects,
    monthRevenue,
    outstanding,
    weekJobs,
    crewSize,
    contracts,
  ] = await Promise.all([
    /**
     * «New leads» counts leads that are NEW. It counted CONTACTED as well, so the deck
     * said 7 and the call sheet it links to said 6 — two numbers for one word, on the
     * first screen of the morning. A lead somebody has already rung is not new.
     */
    prisma.lead.count({ where: { tenantId, status: "NEW" } }),
    prisma.project.count({ where: { tenantId, status: { in: ["SCHEDULED", "IN_PROGRESS"] } } }),
    prisma.task.count({
      where: {
        tenantId,
        status: { in: ["TODO", "IN_PROGRESS"] },
        ...(isAdmin ? {} : { assignedToId: userId }),
      },
    }),
    prisma.lead.findMany({ where: { tenantId }, orderBy: { createdAt: "desc" }, take: 5 }),
    prisma.project.findMany({ where: { tenantId }, orderBy: { updatedAt: "desc" }, take: 5 }),
    isAdmin
      ? prisma.payment.aggregate({
          where: {
            tenantId,
            date: { gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1) },
          },
          _sum: { amountCents: true },
        })
      : null,
    /**
     * What is actually still on the street. The aggregate below used to sum
     * `totalCents`, so a part-paid invoice was counted whole and the deck answered
     * the morning's first question with a bigger number than the book it links to.
     * Owing is total minus what has landed — the same arithmetic `owingCents` runs
     * everywhere else, so the two screens now agree to the cent.
     */
    isAdmin
      ? prisma.invoice.findMany({
          where: { tenantId, status: { in: ["SENT", "PARTIAL"] } },
          select: { totalCents: true, payments: { select: { amountCents: true } } },
        })
      : null,
    prisma.project.findMany({
      where: { tenantId, scheduledDate: { gte: weekStart, lt: weekEnd } },
      orderBy: { scheduledDate: "asc" },
      select: { id: true, title: true, clientName: true, status: true, scheduledDate: true },
    }),
    prisma.user.count({ where: { tenantId, role: "WORKER" } }),
    // Contract visits that need putting on the board — derived, see lib/contracts.ts.
    // Named columns: the lane draws five of them, and `include` was carrying the notes
    // and the price history of every plan on the books to do it.
    //
    // Owner only. Every row carries a plan price, and the lane prints it plus the value
    // of the whole lane — the revenue and receivable readouts beside it are gated and
    // this was not, so the crew read the maintenance book off the front page.
    isAdmin
      ? prisma.serviceContract.findMany({
      where: { tenantId, active: true },
      select: {
        id: true,
        name: true,
        active: true,
        visitMonths: true,
        startedOn: true,
        pricePerVisitCents: true,
        client: { select: { id: true, name: true, address: true } },
        projects: { select: { contractCycle: true } },
      },
        })
      : [],
  ]);

  const serviceDue = contracts
    .map((c) => {
      const booked = new Set(
        c.projects.map((p) => p.contractCycle).filter(Boolean) as string[]
      );
      const next = nextDueVisit(c, booked);
      if (!next) return null;
      const days = daysUntil(next.date);
      if (days > 45) return null;
      return {
        id: c.id,
        name: c.name,
        clientName: c.client.name,
        address: c.client.address,
        pricePerVisitCents: c.pricePerVisitCents,
        dueOn: next.date.toISOString(),
        daysUntil: days,
      };
    })
    .filter(Boolean)
    .slice(0, 5) as Array<{
    id: string;
    name: string;
    clientName: string;
    address: string | null;
    pricePerVisitCents: number;
    dueOn: string;
    daysUntil: number;
  }>;

  /**
   * The five oldest bills still owing. Overdue is derived, not stored — see
   * lib/invoice-state.ts — and so is «still owing», which is why the payments have to
   * come along.
   *
   * Read a page at a time. The lane shows five rows and the old query loaded the entire
   * overdue book to find them: a shop that lets paper age carries hundreds of those, and
   * every one of them arrived with its payments attached so five could be printed. The
   * loop stops at five, so the usual desk costs one page.
   *
   * `id` breaks ties on `dueDate` so the pages cannot overlap or skip a row — several
   * bills come due on the same day all the time.
   */
  const chase: Array<{
    id: string;
    number: string;
    clientName: string;
    totalCents: number;
    amountPaidCents: number;
    dueDate: string | null;
    status: string;
  }> = [];

  if (isAdmin) {
    const PAGE = 25;
    let cursor: string | undefined;

    while (chase.length < 5) {
      const page = await prisma.invoice.findMany({
        where: { tenantId, status: { in: ["SENT", "PARTIAL"] }, dueDate: { lt: new Date() } },
        select: {
          id: true,
          number: true,
          clientName: true,
          totalCents: true,
          dueDate: true,
          status: true,
          payments: { select: { amountCents: true } },
        },
        orderBy: [{ dueDate: "asc" }, { id: "asc" }],
        take: PAGE,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      });
      if (!page.length) break;

      for (const inv of page) {
        const amountPaidCents = inv.payments.reduce((s, p) => s + p.amountCents, 0);
        // A whole cent still owed. Props to a client component stay in cents — this is
        // not the API boundary, and the unit travels in the name.
        if (inv.totalCents - amountPaidCents <= 0) continue;
        chase.push({
          id: inv.id,
          number: inv.number,
          clientName: inv.clientName,
          totalCents: inv.totalCents,
          amountPaidCents,
          dueDate: inv.dueDate ? inv.dueDate.toISOString() : null,
          status: inv.status,
        });
        if (chase.length === 5) break;
      }

      if (page.length < PAGE) break;
      cursor = page[page.length - 1].id;
    }
  }

  /**
   * THE RAIL, IN THE ORDER THE QUESTIONS ARRIVE.
   *
   * The desk is opened at six in the morning to answer three things: how much money is
   * out on the street, who has to be phoned today, and what is on the board. The rail
   * used to run counts first and the money last, so the answer the owner came for was
   * the fifth item down the narrowest column — and all five readouts were the same
   * 30px, which is five things shouting and nothing dominating.
   *
   * Money leads at full gauge size; the counts follow at record size. Different weight,
   * different question.
   */
  const collectedCents = monthRevenue?._sum?.amountCents || 0;
  const outstandingCents = (outstanding ?? []).reduce(
    (sum, inv) =>
      sum + Math.max(inv.totalCents - inv.payments.reduce((p, x) => p + x.amountCents, 0), 0),
    0
  );

  const money = isAdmin
    ? [
        {
          label: `Owing · ${outstanding?.length || 0}`,
          value: formatCents(outstandingCents),
          href: "/invoices",
          // A zero is a zero. Colour reports the size of the number, never its category:
          // an empty month printed emerald read as good news.
          tone: outstandingCents > 0 ? "var(--rose-ink)" : undefined,
        },
        {
          label: "Collected · this month",
          value: formatCents(collectedCents),
          href: "/finance",
          tone: collectedCents > 0 ? "var(--emerald-ink)" : undefined,
        },
      ]
    : [];

  const counts = [
    // The amber lamp — not amber type — marks the one lane needing attention.
    { label: "New leads", value: String(newLeadsCount), href: "/leads", lamp: newLeadsCount > 0 },
    { label: "Active jobs", value: String(activeProjectsCount), href: "/projects" },
    // Two words, so all three labels hold one line when the counts sit side by side on
    // a phone — «Open crew tasks» wrapped and dropped its numeral out of line.
    { label: "Crew tasks", value: String(pendingTasksCount), href: "/tasks" },
  ];

  return (
    <div className="pb-24 md:pb-0">
      <PageHead
        eyebrow={`Shift desk · ${session?.user?.name ?? ""}`}
        title="Dispatch"
        /* The crew's rail carries no money at all, so the owner's line promised them
           something their own screen does not show. */
        sub={
          isAdmin
            ? "Everything booked, quoted and owed — on one deck."
            : "Everything booked and out on the trucks — on one deck."
        }
      />

      {/*
        An asymmetric desk: a stack of equal panels says everything weighs the same.
        The board is the work; the money rail is the consequence. Different widths =
        different weight.

        ORDER FLIPS ON THE PHONE. On the desk the eye takes the board and the rail in
        one look, so the rail sits to the right of the work. On a 390px screen the DOM
        order IS the reading order, and the rail was last: the owner scrolled past the
        week, five jobs and five leads before a single number about money appeared.
        Below `lg` the rail goes first — money, then who to phone, then the board.
      */}
      <div className="mt-10 grid gap-x-10 gap-y-12 lg:grid-cols-[minmax(0,1fr)_300px]">
        {/* The lanes carry their own order below `lg`. On the desk the reading is
            week → work → leads; on a phone the money rail already took the top, and
            leaving the leads lane last put «who do I ring» 1659px down a 844px
            screen. The morning question comes straight after the money. */}
        <div className="order-2 flex min-w-0 flex-col gap-12 lg:order-1">
          <div className="order-2 lg:order-1">
          {/* The week is the hero: it opens the deck with no frame around it. */}
          <DayRail
            jobs={weekJobs.map((j) => ({
              id: j.id,
              title: j.title,
              client: j.clientName,
              status: j.status,
              date: j.scheduledDate ? j.scheduledDate.toISOString() : null,
            }))}
            crewSize={crewSize}
          />
          </div>

          <section className="order-3 lg:order-2">
            <LaneHead
              title="Jobs on the books"
              right={
                <Link href="/projects" className="eyebrow hover:text-ink">
                  All jobs →
                </Link>
              }
            />
            <Lane>
              {recentProjects.length === 0 && (
                <Empty
                  hint="The first work order lands here, on the week board above, and on the crew's phones."
                  action={
                    <Link href="/projects" className={buttonClass("primary")}>
                      New job
                    </Link>
                  }
                >
                  No jobs on the books yet
                </Empty>
              )}
              {recentProjects.map((project) => (
                <Row key={project.id} href={`/projects/${project.id}`} status={project.status}>
                  <div className="flex items-baseline justify-between gap-4">
                    <div className="min-w-0">
                      <p className="t-row truncate font-bold text-ink">{project.title}</p>
                      <p className="t-body mt-1 truncate text-ink-2">
                        {project.clientName}
                        {project.address ? ` · ${project.address}` : ""}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <span
                        className="eyebrow"
                        style={{ color: textToneFor(project.status) }}
                      >
                        {project.status.replace("_", " ")}
                      </span>
                      <span className="mt-1 block">
                        <WoNumber id={project.id} date={project.createdAt} />
                      </span>
                    </div>
                  </div>
                </Row>
              ))}
            </Lane>
          </section>

          <section className="order-1 lg:order-3">
            <LaneHead
              title="Incoming leads"
              lamp={newLeadsCount > 0 ? "var(--amber)" : undefined}
              right={
                <Link href="/leads" className="eyebrow hover:text-ink">
                  All leads →
                </Link>
              }
            />
            <Lane>
              {recentLeads.length === 0 && (
                <Empty
                  hint="Put the intake link on the website and every enquiry arrives here with a phone number on it."
                  action={
                    <Link href="/settings/intake" className={buttonClass("ghost")}>
                      Set up intake
                    </Link>
                  }
                >
                  No leads on the desk
                </Empty>
              )}
              {recentLeads.map((lead) => (
                <Row key={lead.id} href={`/leads/${lead.id}`} status={lead.status}>
                  <div className="flex items-baseline justify-between gap-4">
                    <div className="min-w-0">
                      <p className="t-row truncate font-bold text-ink">{lead.name}</p>
                      <p className="t-body mt-1 truncate text-ink-2">
                        {[lead.jobType, lead.city].filter(Boolean).join(" · ") ||
                          "General inquiry"}
                      </p>
                    </div>
                    {/* How long he has been waiting — the panel used to name the
                        channel and say nothing about the clock, which is the only
                        thing that decides who gets rung first. */}
                    <span className="flex shrink-0 items-baseline gap-3">
                      <span className="eyebrow">{lead.source}</span>
                      <LeadWait
                        lead={{
                          createdAt: lead.createdAt.toISOString(),
                          updatedAt: lead.updatedAt.toISOString(),
                          status: lead.status,
                          notes: lead.notes,
                        }}
                        compact
                      />
                    </span>
                  </div>
                </Row>
              ))}
            </Lane>
          </section>
        </div>

        {/* The money rail: narrow, dense, and read first. */}
        <aside className="order-1 space-y-10 lg:order-2 lg:border-l lg:border-line lg:pl-8">
          {money.length > 0 && (
            <div className="space-y-6">
              {money.map((r, i) => (
                <Link
                  key={r.label}
                  href={r.href}
                  className="arm-readout group block"
                  style={{ ["--i" as string]: i } as React.CSSProperties}
                >
                  <span className="eyebrow group-hover:text-ink">{r.label}</span>
                  <Readout value={r.value} tone={r.tone} className="mt-1.5 block" />
                </Link>
              ))}
            </div>
          )}

          {/* The counts of the day. Same rail, one step down the scale — a tally of
              open tasks and a bill nobody has paid are not the same size of fact. */}
          <div className={money.length > 0 ? "lane pt-4" : undefined}>
            <div className="grid grid-cols-3 gap-4 lg:grid-cols-1 lg:gap-6">
              {counts.map((r, i) => (
                <Link
                  key={r.label}
                  href={r.href}
                  className="arm-readout group block"
                  style={{ ["--i" as string]: money.length + i } as React.CSSProperties}
                >
                  <div className="flex items-center gap-2">
                    {r.lamp && (
                      <span
                        className="inline-block h-1.5 w-1.5 shrink-0 rounded-full"
                        style={{ background: "var(--amber)" }}
                      />
                    )}
                    <span className="eyebrow group-hover:text-ink">{r.label}</span>
                  </div>
                  <Readout value={r.value} size={22} className="mt-1.5 block" />
                </Link>
              ))}
            </div>
          </div>

          {serviceDue.length > 0 && <ServiceDueLane contracts={serviceDue} />}
          {chase.length > 0 && <ChaseLane invoices={chase} />}
        </aside>
      </div>
    </div>
  );
}
