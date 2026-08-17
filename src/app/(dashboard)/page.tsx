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
  StatTile,
  Sparkline,
  MeterBar,
  AgingBar,
  buttonClass,
  textToneFor,
} from "@/components/ui/primitives";
import DayRail from "@/components/DayRail";
import OnboardingChecklist from "@/components/OnboardingChecklist";
import { LeadWait } from "@/components/LeadClock";
import ChaseLane from "@/components/ChaseLane";
import ServiceDueLane from "@/components/ServiceDueLane";
import { nextDueVisit, daysUntil } from "@/lib/contracts";
import { daysOverdue } from "@/lib/invoice-state";
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

  const now = new Date();

  const weekStart = new Date();
  weekStart.setHours(0, 0, 0, 0);
  weekStart.setDate(weekStart.getDate() - weekStart.getDay());
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 7);

  // Today's window — for the crew count and the board-today caption.
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date(todayStart);
  todayEnd.setDate(todayEnd.getDate() + 1);

  // The bridge's money trend runs weekly. Ten Sunday-aligned buckets ending on the
  // current week, so the sparkline lines up with the week board below it, and a
  // thirty-day headline is read off the same fetch rather than a second round trip.
  const SPARK_WEEKS = 10;
  const bucketsStart = new Date(weekStart);
  bucketsStart.setDate(weekStart.getDate() - 7 * (SPARK_WEEKS - 1));
  const thirtyStart = new Date(now);
  thirtyStart.setDate(now.getDate() - 30);

  // One wave, not four. The crew count and the contract book used to be awaited after
  // this block finished, so the desk paid three round trips end to end for answers that
  // depend on nothing.
  const [
    newLeadsCount,
    activeProjectsCount,
    pendingTasksCount,
    recentLeads,
    recentProjects,
    outstanding,
    weekJobs,
    crewSize,
    contracts,
    tenantBorn,
    intakeKeyCount,
    usedKeyCount,
    integrationCount,
    realCrewCount,
    // Revision 4 — the instruments on the command bridge.
    leadStatusGroups,
    projectStatusGroups,
    paymentsWindow,
    todayJobs,
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
    /**
     * What is actually still on the street. The aggregate below used to sum
     * `totalCents`, so a part-paid invoice was counted whole and the deck answered
     * the morning's first question with a bigger number than the book it links to.
     * Owing is total minus what has landed — the same arithmetic `owingCents` runs
     * everywhere else, so the two screens now agree to the cent. `dueDate` rides along
     * so the aging well can split the same money by how late it is.
     */
    isAdmin
      ? prisma.invoice.findMany({
          where: { tenantId, status: { in: ["SENT", "PARTIAL"] } },
          select: {
            totalCents: true,
            dueDate: true,
            status: true,
            payments: { select: { amountCents: true } },
          },
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
    /**
     * The commissioning card's gauges, owner only. Each step of «start receiving
     * leads» is measured against the books rather than ticked by hand: a key on
     * file, a key that has actually carried a lead, a connected channel, a crew
     * member. All four are cheap counts on indexed columns.
     */
    isAdmin
      ? prisma.tenant.findUnique({ where: { id: tenantId }, select: { createdAt: true } })
      : null,
    isAdmin ? prisma.intakeKey.count({ where: { tenantId, isActive: true } }) : 0,
    isAdmin
      ? prisma.intakeKey.count({ where: { tenantId, isActive: true, lastUsedAt: { not: null } } })
      : 0,
    isAdmin ? prisma.channelIntegration.count({ where: { tenantId, isActive: true } }) : 0,
    /**
     * Crew the owner actually invited. Trial workspaces are seeded with a sample
     * tech at `worker.<tenant>@demo.local`, and counting him would tick «invite
     * your crew» on a desk nobody has touched.
     */
    isAdmin
      ? prisma.user.count({
          where: { tenantId, role: "WORKER", NOT: { email: { endsWith: "@demo.local" } } },
        })
      : 0,
    // The lead pipeline, split by stage — the caption under the New-leads tile.
    prisma.lead.groupBy({ by: ["status"], where: { tenantId }, _count: { _all: true } }),
    // The job book, split by state — the scheduled-vs-live meter under Active jobs.
    prisma.project.groupBy({ by: ["status"], where: { tenantId }, _count: { _all: true } }),
    // Ten weeks of takings for the revenue sparkline and the thirty-day headline.
    isAdmin
      ? prisma.payment.findMany({
          where: { tenantId, date: { gte: bucketsStart } },
          select: { amountCents: true, date: true },
        })
      : [],
    // Who is out today — for the crew count and the board-today line.
    prisma.project.findMany({
      where: { tenantId, scheduledDate: { gte: todayStart, lt: todayEnd } },
      select: { assignedToId: true },
    }),
  ]);

  /**
   * A lead the workspace earned, as opposed to the demo seed. The seed carries no
   * marker column, but it is written in the same request that creates the trial
   * workspace — so anything older than the workspace's first minute is the seed,
   * and anything after it is a person. Counted only when a key exists: without
   * one the card shows regardless, and the count would decide nothing.
   */
  const realLeadCount =
    isAdmin && intakeKeyCount > 0 && tenantBorn
      ? await prisma.lead.count({
          where: { tenantId, createdAt: { gt: new Date(tenantBorn.createdAt.getTime() + 60_000) } },
        })
      : 0;

  // The card retires itself: once the door is open and a real lead has walked
  // through it, the desk needs no setup instructions.
  const showOnboarding = isAdmin && (intakeKeyCount === 0 || realLeadCount === 0);

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

  /* ----------------------------------------------------------------------
     THE COMMAND-BRIDGE INSTRUMENTS (Revision 4).
     The headline metrics are lifted off the narrow rail and onto plate
     instruments that sit on the deck. Each carries its own true colour where a
     colour means something — money in emerald, money owed rose, the live lane
     amber — and its own micro-figure: a weekly trend, a state split, an aging
     bar. Nothing is a rainbow; a hue that decorates is a hue that is absent.
     ---------------------------------------------------------------------- */

  // The lead pipeline behind the New-leads tile.
  const leadBy = Object.fromEntries(
    leadStatusGroups.map((g) => [g.status, g._count._all])
  ) as Record<string, number>;
  const contactedCount = leadBy["CONTACTED"] ?? 0;
  const verifiedCount = leadBy["VERIFIED"] ?? 0;

  // Scheduled against in-progress — the job book's live split.
  const projBy = Object.fromEntries(
    projectStatusGroups.map((g) => [g.status, g._count._all])
  ) as Record<string, number>;
  const scheduledCount = projBy["SCHEDULED"] ?? 0;
  const inProgressCount = projBy["IN_PROGRESS"] ?? 0;

  // Who is out today, and how much work is on the road.
  const crewOutToday = new Set(
    todayJobs.map((j) => j.assignedToId).filter(Boolean) as string[]
  ).size;
  const jobsToday = todayJobs.length;

  // Ten weeks of takings → the sparkline; the last thirty days → the headline.
  const weekBuckets = new Array(SPARK_WEEKS).fill(0) as number[];
  let moneyIn30Cents = 0;
  for (const p of paymentsWindow ?? []) {
    const d = new Date(p.date);
    const idx = Math.floor((d.getTime() - bucketsStart.getTime()) / 604_800_000);
    if (idx >= 0 && idx < SPARK_WEEKS) weekBuckets[idx] += p.amountCents;
    if (d >= thirtyStart) moneyIn30Cents += p.amountCents;
  }

  // The receivables, split by age — the sunk well and the Owing tile read from here.
  let curCents = 0;
  let d1to30Cents = 0;
  let d31to60Cents = 0;
  let d60plusCents = 0;
  let overdueCount = 0;
  for (const inv of outstanding ?? []) {
    const paid = inv.payments.reduce((s, x) => s + x.amountCents, 0);
    const owe = inv.totalCents - paid;
    if (owe <= 0) continue;
    const late = daysOverdue({
      status: inv.status,
      totalCents: inv.totalCents,
      dueDate: inv.dueDate,
      amountPaidCents: paid,
    });
    if (late <= 0) {
      curCents += owe;
    } else {
      overdueCount++;
      if (late <= 30) d1to30Cents += owe;
      else if (late <= 60) d31to60Cents += owe;
      else d60plusCents += owe;
    }
  }
  const owingTotalCents = curCents + d1to30Cents + d31to60Cents + d60plusCents;
  const unpaidCount = outstanding?.length ?? 0;

  // The plate band. Owners read money; the crew reads work — so the four
  // instruments differ by role, and the money well shows only to the owner.
  interface Tile {
    key: string;
    label: string;
    value: number;
    href: string;
    money?: boolean;
    tone?: string;
    suffix?: React.ReactNode;
    lamp?: boolean;
    foot?: React.ReactNode;
  }
  const tiles: Tile[] = isAdmin
    ? [
        {
          key: "leads",
          label: "New leads",
          value: newLeadsCount,
          lamp: newLeadsCount > 0,
          href: "/leads",
          foot: (
            <p className="eyebrow leading-relaxed">
              {contactedCount} contacted · {verifiedCount} verified
            </p>
          ),
        },
        {
          key: "in",
          label: "Money in · 30 days",
          value: moneyIn30Cents,
          money: true,
          tone: moneyIn30Cents > 0 ? "var(--emerald-ink)" : undefined,
          href: "/finance",
          foot: (
            <Sparkline
              values={weekBuckets}
              tone="var(--emerald)"
              width={140}
              height={30}
              ariaLabel="Weekly takings, last ten weeks"
            />
          ),
        },
        {
          key: "owing",
          label: "Owing",
          value: owingTotalCents,
          money: true,
          tone: owingTotalCents > 0 ? "var(--rose-ink)" : undefined,
          href: "/invoices",
          foot: (
            <p className="eyebrow leading-relaxed">
              {unpaidCount} unpaid · {overdueCount} overdue
            </p>
          ),
        },
        {
          key: "jobs",
          label: "Active jobs",
          value: activeProjectsCount,
          href: "/projects",
          foot: (
            <>
              <MeterBar
                height={8}
                segments={[
                  { value: scheduledCount, tone: "var(--sky)", label: "Scheduled" },
                  { value: inProgressCount, tone: "var(--amber)", label: "In progress" },
                ]}
                ariaLabel="Scheduled against in progress"
              />
              <p className="eyebrow mt-2.5 leading-relaxed">
                {scheduledCount} booked · {inProgressCount} live
                {jobsToday > 0 ? ` · ${jobsToday} out today` : ""}
              </p>
            </>
          ),
        },
      ]
    : [
        {
          key: "leads",
          label: "New leads",
          value: newLeadsCount,
          lamp: newLeadsCount > 0,
          href: "/leads",
          foot: (
            <p className="eyebrow leading-relaxed">
              {contactedCount} contacted · {verifiedCount} verified
            </p>
          ),
        },
        {
          key: "jobs",
          label: "Active jobs",
          value: activeProjectsCount,
          href: "/projects",
          foot: (
            <MeterBar
              height={8}
              segments={[
                { value: scheduledCount, tone: "var(--sky)", label: "Scheduled" },
                { value: inProgressCount, tone: "var(--amber)", label: "In progress" },
              ]}
              ariaLabel="Scheduled against in progress"
            />
          ),
        },
        {
          key: "tasks",
          label: "My open tasks",
          value: pendingTasksCount,
          lamp: pendingTasksCount > 0,
          href: "/tasks",
        },
        {
          key: "board",
          label: "Out today",
          value: jobsToday,
          suffix: crewOutToday > 0 ? `· ${crewOutToday} crew` : undefined,
          href: "/projects",
        },
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

      {/* THE COMMAND BRIDGE — a band of plate instruments raised off the deck.
          Two up on a phone (each a 44px-plus tap target), four across on the desk;
          the number on each counts up once as the desk arms. */}
      <section aria-label="The desk at a glance" className="mt-8">
        <div className="grid grid-cols-2 gap-3 md:gap-4 lg:grid-cols-4">
          {tiles.map((t, i) => (
            <StatTile
              key={t.key}
              label={t.label}
              value={t.value}
              money={t.money}
              tone={t.tone}
              suffix={t.suffix}
              lamp={t.lamp}
              href={t.href}
              foot={t.foot}
              armIndex={i}
            />
          ))}
        </div>

        {/* THE SUNK WELL — the receivable total, recessed into the deck, with the
            same money split by age. A plate is raised and read first; the well is
            sunk and read against it. Owner only — the crew's board carries no book. */}
        {isAdmin && (
          <div
            className="arm-readout mt-3 border border-line bg-sunk px-5 py-4 md:mt-4"
            style={{ ["--i" as string]: 4 } as React.CSSProperties}
          >
            <div className="flex flex-col gap-5 md:flex-row md:items-center md:gap-10">
              <Link href="/invoices" className="group shrink-0">
                <div className="eyebrow group-hover:text-ink">On the street</div>
                <Readout
                  value={formatCents(owingTotalCents)}
                  tone={owingTotalCents > 0 ? "var(--rose-ink)" : undefined}
                  className="mt-2 block"
                />
                <div className="eyebrow mt-2 text-ink-3">
                  {unpaidCount} unpaid · {overdueCount} overdue
                </div>
              </Link>
              <div className="min-w-0 flex-1">
                <div className="eyebrow mb-2.5">Owing by age</div>
                <AgingBar
                  height={12}
                  showLabels
                  buckets={{
                    currentCents: curCents,
                    d1to30Cents,
                    d31to60Cents,
                    d60plusCents,
                  }}
                />
              </div>
            </div>
          </div>
        )}
      </section>

      {/* The commissioning card sits under the instruments it feeds: a fresh
          workspace cannot receive a lead until the intake plumbing exists, so the
          desk shows the numbers first and the setup it still needs beneath them.
          Dismiss is the owner's, handled inside the component. */}
      {showOnboarding && (
        <div className="mt-10">
          <OnboardingChecklist
            userId={userId}
            steps={{
              hasIntakeKey: intakeKeyCount > 0,
              landingWired: usedKeyCount > 0,
              channelsConnected: integrationCount > 0,
              crewInvited: realCrewCount > 0,
            }}
          />
        </div>
      )}

      {/* The hairline is struck under the bridge on entrance — a drawn rule, not a
          static border, so the band reads as an instrument panel closing off. */}
      <div className="rule-draw mt-10" aria-hidden />

      {/*
        An asymmetric desk: a stack of equal panels says everything weighs the same.
        The board is the work; the actionable lists sit in the narrower rail. Different
        widths = different weight. The rail shows only to the owner — a crew desk runs
        the board full width.
      */}
      <div
        className={
          isAdmin
            ? "mt-8 grid gap-x-10 gap-y-12 lg:grid-cols-[minmax(0,1fr)_300px]"
            : "mt-8"
        }
      >
        <div className="flex min-w-0 flex-col gap-12">
          {/* The week is the hero of the desk: it opens with no frame around it. */}
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

          <section>
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

          <section>
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

        {/* The rail: the two lists the owner acts on — maintenance he can lose by
            forgetting, and money already earned and not yet banked. */}
        {isAdmin && (serviceDue.length > 0 || chase.length > 0) && (
          <aside className="space-y-10 lg:border-l lg:border-line lg:pl-8">
            {serviceDue.length > 0 && <ServiceDueLane contracts={serviceDue} />}
            {chase.length > 0 && <ChaseLane invoices={chase} />}
          </aside>
        )}
      </div>
    </div>
  );
}
