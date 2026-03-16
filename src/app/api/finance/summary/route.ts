import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tenantId = (session.user as any).tenantId as string;

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
