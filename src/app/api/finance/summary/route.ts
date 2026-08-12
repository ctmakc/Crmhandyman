import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/guard";

export async function GET(req: NextRequest) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;
  const { tenantId } = guard.identity;

  const { searchParams } = new URL(req.url);
  const year = Number(searchParams.get("year") || new Date().getFullYear());
  const month = searchParams.get("month") ? Number(searchParams.get("month")) : undefined;

  const startDate = month ? new Date(year, month - 1, 1) : new Date(year, 0, 1);
  const endDate = month ? new Date(year, month, 0, 23, 59, 59) : new Date(year, 11, 31, 23, 59, 59);

  const [payments, expenses, projectCount] = await Promise.all([
    prisma.payment.findMany({
      where: { tenantId, date: { gte: startDate, lte: endDate } },
      include: { project: { select: { id: true, title: true, clientName: true } } },
      orderBy: { date: "desc" },
    }),
    prisma.expense.findMany({
      where: { tenantId, date: { gte: startDate, lte: endDate } },
      include: { project: { select: { id: true, title: true } } },
      orderBy: { date: "desc" },
    }),
    prisma.project.count({
      where: {
        tenantId,
        completedDate: { gte: startDate, lte: endDate },
        status: "COMPLETED",
      },
    }),
  ]);

  const totalRevenue = payments.reduce((sum, p) => sum + p.amount, 0);
  const totalExpenses = expenses.reduce((sum, e) => sum + e.amount, 0);
  const netProfit = totalRevenue - totalExpenses;

  return NextResponse.json({ totalRevenue, totalExpenses, netProfit, projectCount, payments, expenses });
}
