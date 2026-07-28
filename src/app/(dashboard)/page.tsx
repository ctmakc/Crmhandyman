import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { formatCurrency } from "@/lib/utils";
import Link from "next/link";
import {
  PageHead,
  LaneHead,
  Lane,
  Row,
  WoNumber,
  Empty,
  textToneFor,
} from "@/components/ui/primitives";
import DayRail from "@/components/DayRail";
import ChaseLane from "@/components/ChaseLane";
import ServiceDueLane from "@/components/ServiceDueLane";
import { nextDueVisit, daysUntil } from "@/lib/contracts";

export default async function DashboardPage() {
  const session = await getServerSession(authOptions);
  const isAdmin = (session?.user as { role?: string })?.role === "ADMIN";

  const weekStart = new Date();
  weekStart.setHours(0, 0, 0, 0);
  weekStart.setDate(weekStart.getDate() - weekStart.getDay());
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 7);

  const [
    newLeadsCount,
    activeProjectsCount,
    pendingTasksCount,
    recentLeads,
    recentProjects,
    monthRevenue,
    outstanding,
    weekJobs,
  ] = await Promise.all([
    prisma.lead.count({ where: { status: { in: ["NEW", "CONTACTED"] } } }),
    prisma.project.count({ where: { status: { in: ["SCHEDULED", "IN_PROGRESS"] } } }),
    prisma.task.count({
      where: {
        status: { in: ["TODO", "IN_PROGRESS"] },
        ...(isAdmin ? {} : { assignedToId: (session?.user as { id?: string })?.id }),
      },
    }),
    prisma.lead.findMany({ orderBy: { createdAt: "desc" }, take: 5 }),
    prisma.project.findMany({ orderBy: { updatedAt: "desc" }, take: 5 }),
    isAdmin
      ? prisma.payment.aggregate({
          where: {
            date: { gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1) },
          },
          _sum: { amount: true },
        })
      : null,
    isAdmin
      ? prisma.invoice.aggregate({
          where: { status: { in: ["SENT", "PARTIAL"] } },
          _sum: { total: true },
          _count: true,
        })
      : null,
    prisma.project.findMany({
      where: { scheduledDate: { gte: weekStart, lt: weekEnd } },
      orderBy: { scheduledDate: "asc" },
      select: { id: true, title: true, clientName: true, status: true, scheduledDate: true },
    }),
  ]);

  const crewSize = await prisma.user.count({ where: { role: "WORKER" } });

  // Contract visits that need putting on the board — derived, see lib/contracts.ts.
  const contracts = await prisma.serviceContract.findMany({
    where: { active: true },
    include: {
      client: { select: { id: true, name: true, address: true } },
      projects: { select: { contractCycle: true } },
    },
  });
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
        pricePerVisit: c.pricePerVisit,
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
    pricePerVisit: number;
    dueOn: string;
    daysUntil: number;
  }>;

  // Overdue is derived, not stored — see lib/invoice-state.ts.
  const openInvoices = isAdmin
    ? await prisma.invoice.findMany({
        where: { status: { in: ["SENT", "PARTIAL"] }, dueDate: { lt: new Date() } },
        include: { payments: { select: { amount: true } } },
        orderBy: { dueDate: "asc" },
      })
    : [];

  const chase = openInvoices
    .map((inv) => ({
      id: inv.id,
      number: inv.number,
      clientName: inv.clientName,
      total: inv.total,
      amountPaid: inv.payments.reduce((s, p) => s + p.amount, 0),
      dueDate: inv.dueDate ? inv.dueDate.toISOString() : null,
      status: inv.status,
    }))
    .filter((inv) => inv.total - inv.amountPaid > 0.005)
    .slice(0, 5);

  const readouts = [
    // The amber lamp — not amber type — marks the one lane needing attention.
    { label: "New leads", value: String(newLeadsCount), href: "/leads", lamp: newLeadsCount > 0 },
    { label: "Active jobs", value: String(activeProjectsCount), href: "/projects" },
    { label: "Open crew tasks", value: String(pendingTasksCount), href: "/tasks" },
    ...(isAdmin
      ? [
          {
            label: "Collected · MTD",
            value: formatCurrency(monthRevenue?._sum.amount || 0),
            href: "/finance",
            tone: "var(--emerald-ink)",
          },
          {
            label: `Outstanding · ${outstanding?._count || 0}`,
            value: formatCurrency(outstanding?._sum.total || 0),
            href: "/invoices",
            tone: (outstanding?._sum.total || 0) > 0 ? "var(--rose-ink)" : undefined,
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
            {readouts.map((r) => (
              <Link key={r.label} href={r.href} className="group block">
                <div className="flex items-center gap-2">
                  {"lamp" in r && r.lamp && (
                    <span
                      className="inline-block h-1.5 w-1.5 shrink-0 rounded-full"
                      style={{ background: "var(--amber)" }}
                    />
                  )}
                  <span className="eyebrow group-hover:text-ink">{r.label}</span>
                </div>
                <div
                  className="mono mt-1.5 text-[30px] font-bold leading-none tracking-tight"
                  style={{ color: r.tone || "var(--ink)" }}
                >
                  {r.value}
                </div>
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
