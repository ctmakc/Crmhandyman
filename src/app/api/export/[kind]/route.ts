import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/guard";
import { dayStamp } from "@/lib/dates";
import { jobMoney } from "@/lib/margin";

/**
 * CSV for the bookkeeper.
 *
 * Excel-safe on purpose: a leading `=`, `+`, `-` or `@` in a cell is executed as a
 * formula by Excel and Sheets, which is both a broken export and a real injection
 * vector. Those cells get a leading apostrophe.
 */
const csvCell = (v: unknown) => {
  if (v === null || v === undefined) return "";
  let s = String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

const csv = (rows: Array<Array<unknown>>) =>
  rows.map((r) => r.map(csvCell).join(",")).join("\r\n");

/**
 * Local calendar day. Printed in UTC, an evening payment moved to the next date and an
 * evening payment on the 31st moved into the next month — the bookkeeper's file then
 * disagreed with the screen the owner read it off.
 */
const day = dayStamp;

const KINDS = ["invoices", "payments", "expenses", "jobs"] as const;
type Kind = (typeof KINDS)[number];

export async function GET(req: NextRequest, { params }: { params: { kind: string } }) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;
  const { tenantId } = guard.identity;

  const kind = params.kind as Kind;
  if (!KINDS.includes(kind))
    return NextResponse.json({ error: `Unknown export: ${params.kind}` }, { status: 400 });

  const { searchParams } = new URL(req.url);
  const year = Number(searchParams.get("year") || new Date().getFullYear());
  const monthParam = searchParams.get("month");
  const month = monthParam ? Number(monthParam) : undefined;
  const from = month ? new Date(year, month - 1, 1) : new Date(year, 0, 1);
  const to = month
    ? new Date(year, month, 0, 23, 59, 59)
    : new Date(year, 11, 31, 23, 59, 59);

  let rows: Array<Array<unknown>> = [];

  if (kind === "invoices") {
    const invoices = await prisma.invoice.findMany({
      where: { tenantId, issuedAt: { gte: from, lte: to } },
      include: { payments: { select: { amount: true } }, project: { select: { title: true } } },
      orderBy: { issuedAt: "asc" },
    });
    rows = [
      ["Number", "Kind", "Status", "Client", "Job", "Issued", "Due", "Subtotal", "Tax", "Total", "Paid", "Owing"],
      ...invoices.map((i) => {
        const paid = i.payments.reduce((s, p) => s + p.amount, 0);
        return [
          i.number, i.kind, i.status, i.clientName, i.project.title,
          day(i.issuedAt), day(i.dueDate),
          i.subtotal.toFixed(2), i.tax.toFixed(2), i.total.toFixed(2),
          paid.toFixed(2), (i.total - paid).toFixed(2),
        ];
      }),
    ];
  }

  if (kind === "payments") {
    const payments = await prisma.payment.findMany({
      where: { tenantId, date: { gte: from, lte: to } },
      include: {
        project: { select: { title: true, clientName: true } },
        invoice: { select: { number: true } },
      },
      orderBy: { date: "asc" },
    });
    rows = [
      ["Date", "Amount", "Method", "Client", "Job", "Invoice", "Notes"],
      ...payments.map((p) => [
        day(p.date), p.amount.toFixed(2), p.method,
        p.project.clientName, p.project.title, p.invoice?.number ?? "", p.notes ?? "",
      ]),
    ];
  }

  if (kind === "expenses") {
    const expenses = await prisma.expense.findMany({
      where: { tenantId, date: { gte: from, lte: to } },
      include: { project: { select: { title: true } } },
      orderBy: { date: "asc" },
    });
    rows = [
      ["Date", "Amount", "Category", "Job", "Description"],
      ...expenses.map((e) => [
        day(e.date), e.amount.toFixed(2), e.category,
        e.project?.title ?? "General overhead", e.description ?? "",
      ]),
    ];
  }

  if (kind === "jobs") {
    const jobs = await prisma.project.findMany({
      where: { tenantId, createdAt: { lte: to } },
      include: {
        // Newest first: jobMoney reads the live accepted price off the head of the list.
        estimates: { select: { total: true, status: true }, orderBy: { createdAt: "desc" } },
        invoices: { select: { total: true, status: true } },
        payments: { select: { amount: true } },
        expenses: { select: { amount: true } },
      },
      orderBy: { createdAt: "asc" },
    });
    rows = [
      ["Job", "Client", "Address", "Status", "Scheduled", "Completed", "Quoted", "Invoiced", "Collected", "Costs", "Margin", "Margin %"],
      // Same arithmetic as the job card: the export and the screen must never differ.
      ...jobs.map((j) => {
        const m = jobMoney(j);
        return [
          j.title, j.clientName, j.address, j.status,
          day(j.scheduledDate), day(j.completedDate),
          m.quoted.toFixed(2), m.invoiced.toFixed(2), m.collected.toFixed(2), m.costs.toFixed(2),
          m.margin.toFixed(2), m.marginPct === null ? "" : m.marginPct.toFixed(1),
        ];
      }),
    ];
  }

  const period = month ? `${year}-${String(month).padStart(2, "0")}` : String(year);
  // The BOM keeps Excel from mangling accented client names.
  return new NextResponse("﻿" + csv(rows), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${kind}-${period}.csv"`,
    },
  });
}
