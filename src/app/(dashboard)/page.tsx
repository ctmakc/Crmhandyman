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
  textToneFor,
} from "@/components/ui/primitives";
import DayRail from "@/components/DayRail";
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
    isAdmin
      ? prisma.invoice.aggregate({
          where: { tenantId, status: { in: ["SENT", "PARTIAL"] } },
          _sum: { totalCents: true },
          _count: true,
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

  const readouts = [
    // The amber lamp — not amber type — marks the one lane needing attention.
    { label: "New leads", value: String(newLeadsCount), href: "/leads", lamp: newLeadsCount > 0 },
    { label: "Active jobs", value: String(activeProjectsCount), href: "/projects" },
    { label: "Open crew tasks", value: String(pendingTasksCount), href: "/tasks" },
    ...(isAdmin
      ? [
          {
            label: "Collected · MTD",
            value: formatCents(monthRevenue?._sum?.amountCents || 0),
            href: "/finance",
            tone: "var(--emerald-ink)",
          },
          {
            label: `Outstanding · ${outstanding?._count || 0}`,
            value: formatCents(outstanding?._sum?.totalCents || 0),
            href: "/invoices",
            tone: (outstanding?._sum?.totalCents || 0) > 0 ? "var(--rose-ink)" : undefined,
          },
        ]
      : []),
  ];

  return (
    <div className="pb-24 md:pb-0">
      <PageHead
        eyebrow={`Shift desk · ${session?.user?.name ?? ""}`}
        title="Dispatch"
        sub="Everything booked, quoted and owed — on one deck."
      />

      {/*
        An asymmetric desk, not a stack of equal panels. The board is the work;
        the money rail is the consequence. Different widths = different weight.
      */}
      <div className="mt-10 grid gap-x-10 gap-y-12 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="min-w-0 space-y-12">
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

          <section>
            <LaneHead
              title="Jobs in the yard"
              right={
                <Link href="/projects" className="eyebrow hover:text-ink">
                  All jobs →
                </Link>
              }
            />
            <Lane>
              {recentProjects.length === 0 && <Empty>Nothing scheduled</Empty>}
              {recentProjects.map((project) => (
                <Row key={project.id} href={`/projects/${project.id}`} status={project.status}>
                  <div className="flex items-baseline justify-between gap-4">
                    <div className="min-w-0">
                      <p className="truncate text-[15px] font-bold leading-tight text-ink">
                        {project.title}
                      </p>
                      <p className="mt-0.5 truncate text-[13px] text-ink-2">
                        {project.clientName}
                        {project.address ? ` · ${project.address}` : ""}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <span
                        className="mono text-[11px] tracking-[0.08em]"
                        style={{ color: textToneFor(project.status) }}
                      >
                        {project.status.replace("_", " ")}
                      </span>
                      <span className="mt-0.5 block">
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
              {recentLeads.length === 0 && <Empty>No leads on the desk</Empty>}
              {recentLeads.map((lead) => (
                <Row key={lead.id} href={`/leads/${lead.id}`} status={lead.status}>
                  <div className="flex items-baseline justify-between gap-4">
                    <div className="min-w-0">
                      <p className="truncate text-[15px] font-bold leading-tight text-ink">
                        {lead.name}
                      </p>
                      <p className="mt-0.5 truncate text-[13px] text-ink-2">
                        {[lead.jobType, lead.city].filter(Boolean).join(" · ") ||
                          "General inquiry"}
                      </p>
                    </div>
                    <span className="eyebrow shrink-0">{lead.source}</span>
                  </div>
                </Row>
              ))}
            </Lane>
          </section>
        </div>

        {/* The money rail: narrow, dense, quiet. Read after the board, not before. */}
        <aside className="space-y-10 lg:border-l lg:border-line lg:pl-8">
          <div className="space-y-6">
            {readouts.map((r, i) => (
              <Link
                key={r.label}
                href={r.href}
                className="arm-readout group block"
                style={{ ["--i" as string]: i } as React.CSSProperties}
              >
                <div className="flex items-center gap-2">
                  {"lamp" in r && r.lamp && (
                    <span
                      className="inline-block h-1.5 w-1.5 shrink-0 rounded-full"
                      style={{ background: "var(--amber)" }}
                    />
                  )}
                  <span className="eyebrow group-hover:text-ink">{r.label}</span>
                </div>
                <Readout value={r.value} tone={r.tone} className="mt-1.5 block" />
              </Link>
            ))}
          </div>

          {serviceDue.length > 0 && <ServiceDueLane contracts={serviceDue} />}
          {chase.length > 0 && <ChaseLane invoices={chase} />}
        </aside>
      </div>
    </div>
  );
}
