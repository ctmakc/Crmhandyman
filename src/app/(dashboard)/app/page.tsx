import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { formatCurrency } from "@/lib/utils";
import Link from "next/link";

const leadSourceColors: Record<string, string> = {
  FACEBOOK: "bg-blue-100 text-blue-700",
  INSTAGRAM: "bg-pink-100 text-pink-700",
  GOOGLE: "bg-green-100 text-green-700",
  HOMESTARS: "bg-orange-100 text-orange-700",
  KIJIJI: "bg-yellow-100 text-yellow-700",
  EMAIL: "bg-purple-100 text-purple-700",
  MARKETPLACE: "bg-orange-100 text-orange-800",
  DIRECTORY: "bg-cyan-100 text-cyan-800",
  REFERRAL: "bg-emerald-100 text-emerald-800",
  LEAD_EXCHANGE: "bg-indigo-100 text-indigo-800",
  SUBCONTRACT: "bg-violet-100 text-violet-800",
  JOB_BOARD: "bg-sky-100 text-sky-800",
  MANUAL: "bg-gray-100 text-gray-700",
  OTHER: "bg-gray-100 text-gray-700",
};

const projectStatusColors: Record<string, string> = {
  SCHEDULED: "bg-yellow-100 text-yellow-700",
  IN_PROGRESS: "bg-blue-100 text-blue-700",
  COMPLETED: "bg-green-100 text-green-700",
  CANCELLED: "bg-red-100 text-red-700",
};

export default async function DashboardPage() {
  const session = await getServerSession(authOptions);
  const user = session?.user as { id?: string; tenantId?: string; role?: string; name?: string } | undefined;
  const tenantId = user?.tenantId;
  if (!tenantId) return null;

  const isAdmin = user.role === "ADMIN";
  const [newLeadsCount, activeProjectsCount, pendingTasksCount, recentLeads, recentProjects, monthRevenue] =
    await Promise.all([
      prisma.lead.count({
        where: { tenantId, status: { in: ["NEW", "CONTACTED"] } },
      }),
      prisma.project.count({
        where: { tenantId, status: { in: ["SCHEDULED", "IN_PROGRESS"] } },
      }),
      prisma.task.count({
        where: {
          tenantId,
          status: { in: ["TODO", "IN_PROGRESS"] },
          ...(isAdmin ? {} : { assignedToId: user.id }),
        },
      }),
      prisma.lead.findMany({
        where: { tenantId },
        orderBy: { createdAt: "desc" },
        take: 5,
      }),
      prisma.project.findMany({
        where: { tenantId },
        orderBy: { updatedAt: "desc" },
        take: 5,
      }),
      isAdmin
        ? prisma.payment.aggregate({
            where: {
              tenantId,
              date: { gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1) },
            },
            _sum: { amount: true },
          })
        : null,
    ]);

  return (
    <div className="space-y-6 pb-20 md:pb-0">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
          <p className="text-gray-500">Welcome back, {user.name}</p>
        </div>
        <Link
          href="/directory"
          className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-bold text-gray-700 hover:border-orange-300 hover:text-orange-700"
        >
          Open public network
        </Link>
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {[
          { label: "New Leads", value: newLeadsCount, href: "/leads", link: "View leads" },
          { label: "Active Jobs", value: activeProjectsCount, href: "/projects", link: "View jobs" },
          { label: "My Tasks", value: pendingTasksCount, href: "/tasks", link: "View tasks" },
        ].map((item) => (
          <div key={item.label} className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
            <p className="text-sm text-gray-500">{item.label}</p>
            <p className="mt-1 text-3xl font-bold text-gray-900">{item.value}</p>
            <Link href={item.href} className="mt-2 inline-block text-xs text-blue-600 hover:underline">
              {item.link} →
            </Link>
          </div>
        ))}
        {isAdmin && (
          <div className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
            <p className="text-sm text-gray-500">Revenue (Month)</p>
            <p className="mt-1 text-2xl font-bold text-green-600">
              {formatCurrency(monthRevenue?._sum.amount ?? 0)}
            </p>
            <Link href="/finance" className="mt-2 inline-block text-xs text-blue-600 hover:underline">
              View finance →
            </Link>
          </div>
        )}
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <section className="rounded-xl border border-gray-100 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-gray-100 p-4">
            <h2 className="font-semibold text-gray-900">Recent Leads</h2>
            <Link href="/leads" className="text-sm text-blue-600 hover:underline">View all</Link>
          </div>
          <div className="divide-y divide-gray-50">
            {recentLeads.length === 0 && <p className="p-4 text-sm text-gray-500">No leads yet.</p>}
            {recentLeads.map((lead) => (
              <Link
                key={lead.id}
                href={`/leads/${lead.id}`}
                className="flex items-center justify-between p-4 transition-colors hover:bg-gray-50"
              >
                <div>
                  <p className="text-sm font-medium text-gray-900">{lead.name}</p>
                  <p className="text-xs text-gray-500">{lead.jobType || "General inquiry"}</p>
                </div>
                <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${leadSourceColors[lead.source] ?? leadSourceColors.OTHER}`}>
                  {lead.source.replaceAll("_", " ")}
                </span>
              </Link>
            ))}
          </div>
        </section>

        <section className="rounded-xl border border-gray-100 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-gray-100 p-4">
            <h2 className="font-semibold text-gray-900">Active Projects</h2>
            <Link href="/projects" className="text-sm text-blue-600 hover:underline">View all</Link>
          </div>
          <div className="divide-y divide-gray-50">
            {recentProjects.length === 0 && <p className="p-4 text-sm text-gray-500">No projects yet.</p>}
            {recentProjects.map((project) => (
              <Link
                key={project.id}
                href={`/projects/${project.id}`}
                className="flex items-center justify-between p-4 transition-colors hover:bg-gray-50"
              >
                <div>
                  <p className="text-sm font-medium text-gray-900">{project.title}</p>
                  <p className="text-xs text-gray-500">{project.clientName}</p>
                </div>
                <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${projectStatusColors[project.status]}`}>
                  {project.status.replaceAll("_", " ")}
                </span>
              </Link>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
