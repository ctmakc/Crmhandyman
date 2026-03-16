import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { formatCurrency } from "@/lib/utils";

export async function GET(req: NextRequest, { params: _params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const estimateId = searchParams.get("estimateId");
  if (!estimateId) return NextResponse.json({ error: "estimateId required" }, { status: 400 });

  const estimate = await prisma.estimate.findUnique({
    where: { id: estimateId },
    include: { project: true },
  });

  if (!estimate) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const lineItems = JSON.parse(estimate.lineItems) as Array<{
    description: string;
    qty: number;
    unit: string;
    unitPrice: number;
  }>;

  const htmlContent = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  body { font-family: Arial, sans-serif; margin: 40px; color: #333; }
  h1 { color: #1d4ed8; }
  .header { display: flex; justify-content: space-between; margin-bottom: 40px; }
  .company { font-size: 24px; font-weight: bold; color: #1d4ed8; }
  table { width: 100%; border-collapse: collapse; margin-top: 20px; }
  th { background: #f3f4f6; padding: 10px; text-align: left; border-bottom: 2px solid #e5e7eb; }
  td { padding: 10px; border-bottom: 1px solid #e5e7eb; }
  .totals { margin-top: 20px; text-align: right; }
  .totals table { width: 250px; margin-left: auto; }
  .total-row td { font-weight: bold; font-size: 16px; }
</style>
</head>
<body>
<div class="header">
  <div>
    <div class="company">🔧 HandymanPro</div>
    <div>Professional Handyman Services</div>
  </div>
  <div style="text-align:right">
    <strong>ESTIMATE</strong><br>
    Date: ${new Date().toLocaleDateString("en-CA")}<br>
    Valid until: ${estimate.validUntil ? new Date(estimate.validUntil).toLocaleDateString("en-CA") : "30 days"}
  </div>
</div>

<div>
  <strong>Client:</strong> ${estimate.project.clientName}<br>
  <strong>Address:</strong> ${estimate.project.address}<br>
  ${estimate.project.phone ? `<strong>Phone:</strong> ${estimate.project.phone}<br>` : ""}
  ${estimate.project.email ? `<strong>Email:</strong> ${estimate.project.email}<br>` : ""}
</div>

<h3>Project: ${estimate.project.title}</h3>

<table>
  <thead>
    <tr>
      <th>Description</th>
      <th>Qty</th>
      <th>Unit</th>
      <th>Unit Price</th>
      <th>Total</th>
    </tr>
  </thead>
  <tbody>
    ${lineItems.map(item => `
    <tr>
      <td>${item.description}</td>
      <td>${item.qty}</td>
      <td>${item.unit}</td>
      <td>${formatCurrency(item.unitPrice)}</td>
      <td>${formatCurrency(item.qty * item.unitPrice)}</td>
    </tr>`).join("")}
  </tbody>
</table>

<div class="totals">
  <table>
    <tr><td>Subtotal</td><td>${formatCurrency(estimate.subtotal)}</td></tr>
    <tr><td>HST/GST (13%)</td><td>${formatCurrency(estimate.tax)}</td></tr>
    <tr class="total-row"><td><strong>TOTAL</strong></td><td><strong>${formatCurrency(estimate.total)}</strong></td></tr>
  </table>
</div>

${estimate.notes ? `<div style="margin-top:30px"><strong>Notes:</strong><br>${estimate.notes}</div>` : ""}

<div style="margin-top:40px; font-size:12px; color:#666; border-top:1px solid #e5e7eb; padding-top:20px">
  To accept this estimate, please reply to this email or call us. Thank you for choosing HandymanPro!
</div>
</body>
</html>`;

  return new NextResponse(htmlContent, {
    headers: {
      "Content-Type": "text/html",
      "Content-Disposition": `inline; filename="estimate-${estimateId}.html"`,
    },
  });
}
