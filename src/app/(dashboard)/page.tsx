import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { formatCurrency } from "@/lib/utils";
import Link from "next/link";

export default async function DashboardPage() {
  const session = await getServerSession(authOptions);
  const isAdmin = (session?.user as { role?: string })?.role === "ADMIN";

  const [
    newLeadsCount,
    activeProjectsCount,
    pendingTasksCount,
    recentLeads,
    recentProjects,
    monthRevenue,
  ] = await Promise.all([
    prisma.lead.count({ where: { status: { in: ["NEW", "CONTACTED"] } } }),
    prisma.project.count({ where: { status: { in: ["SCHEDULED", "IN_PROGRESS"] } } }),
    prisma.task.count({
      where: {
        status: { in: ["TODO", "IN_PROGRESS"] },
        ...(isAdmin ? {} : { assignedToId: (session?.user as { id?: string })?.id }),
      },
    }),
    prisma.lead.findMany({
      orderBy: { createdAt: "desc" },
      take: 5,
    }),
    prisma.project.findMany({
      orderBy: { updatedAt: "desc" },
      take: 5,
    }),
    isAdmin
      ? prisma.payment.aggregate({
          where: {
            date: {
              gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
            },
          },
          _sum: { amount: true },
        })
      : null,
  ]);

  const leadSourceColors: Record<string, string> = {
    FACEBOOK: "bg-blue-100 text-blue-700",
    INSTAGRAM: "bg-pink-100 text-pink-700",
    GOOGLE: "bg-green-100 text-green-700",
    HOMESTARS: "bg-orange-100 text-orange-700",
    KIJIJI: "bg-yellow-100 text-yellow-700",
    EMAIL: "bg-purple-100 text-purple-700",
    MANUAL: "bg-gray-100 text-gray-700",
    OTHER: "bg-gray-100 text-gray-700",
  };

  const projectStatusColors: Record<string, string> = {
    SCHEDULED: "bg-yellow-100 text-yellow-700",
    IN_PROGRESS: "bg-blue-100 text-blue-700",
    COMPLETED: "bg-green-100 text-green-700",
    CANCELLED: "bg-red-100 text-red-700",
  };

  return (
    <div className="space-y-6 pb-20 md:pb-0">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-gray-500">Welcome back, {session?.user?.name}</p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
          <p className="text-sm text-gray-500">New Leads</p>
          <p className="text-3xl font-bold text-gray-900 mt-1">{newLeadsCount}</p>
          <Link href="/leads" className="text-xs text-blue-600 mt-2 inline-block hover:underline">
            View leads →
          </Link>
        </div>
        <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
          <p className="text-sm text-gray-500">Active Jobs</p>
          <p className="text-3xl font-bold text-gray-900 mt-1">{activeProjectsCount}</p>
          <Link href="/projects" className="text-xs text-blue-600 mt-2 inline-block hover:underline">
            View jobs →
          </Link>
        </div>
        <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
          <p className="text-sm text-gray-500">My Tasks</p>
          <p className="text-3xl font-bold text-gray-900 mt-1">{pendingTasksCount}</p>
          <Link href="/tasks" className="text-xs text-blue-600 mt-2 inline-block hover:underline">
            View tasks →
          </Link>
        </div>
        {isAdmin && (
          <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
            <p className="text-sm text-gray-500">Revenue (Month)</p>
            <p className="text-2xl font-bold text-green-600 mt-1">
              {formatCurrency(monthRevenue?._sum.amount || 0)}
            </p>
            <Link href="/finance" className="text-xs text-blue-600 mt-2 inline-block hover:underline">
              View finance →
            </Link>
          </div>
        )}
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        {/* Recent Leads */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100">
          <div className="flex items-center justify-between p-4 border-b border-gray-100">
            <h2 className="font-semibold text-gray-900">Recent Leads</h2>
            <Link href="/leads" className="text-sm text-blue-600 hover:underline">View all</Link>
          </div>
          <div className="divide-y divide-gray-50">
            {recentLeads.length === 0 && (
              <p className="text-sm text-gray-500 p-4">No leads yet.</p>
            )}
            {recentLeads.map((lead) => (
              <Link
                key={lead.id}
                href={`/leads/${lead.id}`}
                className="flex items-center justify-between p-4 hover:bg-gray-50 transition-colors"
              >
                <div>
                  <p className="font-medium text-gray-900 text-sm">{lead.name}</p>
                  <p className="text-xs text-gray-500">{lead.jobType || "General inquiry"}</p>
                </div>
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${leadSourceColors[lead.source]}`}>
                  {lead.source}
                </span>
              </Link>
            ))}
          </div>
        </div>

        {/* Recent Projects */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100">
          <div className="flex items-center justify-between p-4 border-b border-gray-100">
            <h2 className="font-semibold text-gray-900">Active Projects</h2>
            <Link href="/projects" className="text-sm text-blue-600 hover:underline">View all</Link>
          </div>
          <div className="divide-y divide-gray-50">
            {recentProjects.length === 0 && (
              <p className="text-sm text-gray-500 p-4">No projects yet.</p>
            )}
            {recentProjects.map((project) => (
              <Link
                key={project.id}
                href={`/projects/${project.id}`}
                className="flex items-center justify-between p-4 hover:bg-gray-50 transition-colors"
              >
                <div>
                  <p className="font-medium text-gray-900 text-sm">{project.title}</p>
                  <p className="text-xs text-gray-500">{project.clientName}</p>
                </div>
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${projectStatusColors[project.status]}`}>
                  {project.status.replace("_", " ")}
                </span>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
