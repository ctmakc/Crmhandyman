import assert from "node:assert/strict";
import { prisma } from "../src/lib/prisma";
import { createInboundLead } from "../src/lib/inbound-leads";
import { consumeRateLimit } from "../src/lib/rate-limit";
import { createNumberedInvoice } from "../src/lib/invoice-create";
import { InvoicePaymentError, recordInvoicePayment } from "../src/lib/invoice-payment";
import { applyStripeCheckoutEvent } from "../src/lib/stripe-payments";

process.env.RATE_LIMIT_PEPPER ||= "ci-rate-limit-pepper";

async function main() {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const tenant = await prisma.tenant.create({
    data: {
      slug: `regression-${suffix}`,
      businessName: "Regression Heating",
      ownerEmail: `owner-${suffix}@example.test`,
      plan: "DEMO",
      expiresAt: new Date(Date.now() + 86_400_000),
    },
  });
  const otherTenant = await prisma.tenant.create({
    data: {
      slug: `other-${suffix}`,
      businessName: "Other Tenant",
      ownerEmail: `other-${suffix}@example.test`,
      plan: "DEMO",
      expiresAt: new Date(Date.now() + 86_400_000),
    },
  });

  const externalId = `facebook-${suffix}`;
  const deliveries = await Promise.all([
    createInboundLead({
      tenantId: tenant.id,
      channel: "FACEBOOK",
      externalId,
      name: "Jamie Regression",
      phone: "+16135550123",
      address: "10 Test Street",
      city: "Ottawa",
      source: "FACEBOOK",
      jobType: "Furnace repair",
    }),
    createInboundLead({
      tenantId: tenant.id,
      channel: "FACEBOOK",
      externalId,
      name: "Jamie Regression",
      phone: "+16135550123",
      address: "10 Test Street",
      city: "Ottawa",
      source: "FACEBOOK",
      jobType: "Furnace repair",
    }),
  ]);
  assert.equal(new Set(deliveries.map((row) => row.lead.id)).size, 1, "duplicate webhook deliveries must resolve to one lead");
  assert.equal(await prisma.lead.count({ where: { tenantId: tenant.id, sourceLeadId: externalId } }), 1);
  assert.equal(await prisma.inboundReceipt.count({ where: { tenantId: tenant.id, channel: "FACEBOOK", externalId } }), 1);

  const rateScope = `regression-${suffix}`;
  const r1 = await consumeRateLimit({ scope: rateScope, identifier: "same-ip", limit: 2, windowMs: 60_000, now: 1_000_000 });
  const r2 = await consumeRateLimit({ scope: rateScope, identifier: "same-ip", limit: 2, windowMs: 60_000, now: 1_000_001 });
  const r3 = await consumeRateLimit({ scope: rateScope, identifier: "same-ip", limit: 2, windowMs: 60_000, now: 1_000_002 });
  assert.equal(r1.allowed, true);
  assert.equal(r2.allowed, true);
  assert.equal(r3.allowed, false);

  const lead = deliveries[0].lead;
  const client = await prisma.client.create({
    data: {
      tenantId: tenant.id,
      name: lead.name,
      phone: lead.phone,
      address: lead.address,
      city: lead.city,
    },
  });
  const project = await prisma.$transaction(async (tx) => {
    const created = await tx.project.create({
      data: {
        tenantId: tenant.id,
        leadId: lead.id,
        clientId: client.id,
        clientName: lead.name,
        phone: lead.phone,
        address: lead.address || "10 Test Street",
        title: "Replace furnace blower motor",
        jobType: lead.jobType,
        status: "SCHEDULED",
      },
    });
    await tx.lead.update({ where: { id: lead.id }, data: { status: "CONVERTED", clientId: client.id } });
    return created;
  });

  const estimate = await prisma.estimate.create({
    data: {
      projectId: project.id,
      lineItems: JSON.stringify([{ description: "Blower motor replacement", qty: 1, unit: "ea", unitPrice: 1000 }]),
      subtotal: 1000,
      tax: 130,
      total: 1130,
      status: "ACCEPTED",
    },
  });

  const invoice = await createNumberedInvoice(tenant.id, {
    projectId: project.id,
    estimateId: estimate.id,
    clientName: project.clientName,
    address: project.address,
    lineItems: estimate.lineItems,
    subtotal: estimate.subtotal,
    tax: estimate.tax,
    total: estimate.total,
    status: "SENT",
    dueDate: new Date(Date.now() + 14 * 86_400_000),
  });

  const partial = await recordInvoicePayment({
    tenantId: tenant.id,
    invoiceId: invoice.id,
    amount: 300,
    method: "E_TRANSFER",
  });
  assert.equal(partial.updated.status, "PARTIAL");

  const settled = await recordInvoicePayment({
    tenantId: tenant.id,
    invoiceId: invoice.id,
    amount: 830,
    method: "CARD",
  });
  assert.equal(settled.updated.status, "PAID");
  assert.equal(await prisma.payment.count({ where: { tenantId: tenant.id, invoiceId: invoice.id } }), 2);
  assert.equal(
    (await prisma.payment.aggregate({ where: { tenantId: tenant.id, invoiceId: invoice.id }, _sum: { amount: true } }))._sum.amount,
    1130
  );

  await assert.rejects(
    () => recordInvoicePayment({ tenantId: otherTenant.id, invoiceId: invoice.id, amount: 1 }),
    (error: unknown) => error instanceof InvoicePaymentError && error.status === 404
  );
  await assert.rejects(
    () => recordInvoicePayment({ tenantId: tenant.id, invoiceId: invoice.id, amount: 1 }),
    (error: unknown) => error instanceof InvoicePaymentError && error.status === 409
  );

  const stripeInvoice = await createNumberedInvoice(tenant.id, {
    projectId: project.id,
    clientName: project.clientName,
    address: project.address,
    lineItems: JSON.stringify([{ description: "Stripe settlement probe", qty: 1, unit: "ea", unitPrice: 200 }]),
    subtotal: 200,
    tax: 26,
    total: 226,
    status: "SENT",
  });
  const stripeEvent = {
    id: `evt-${suffix}`,
    type: "checkout.session.completed",
    data: {
      object: {
        id: `cs-${suffix}`,
        payment_status: "paid",
        amount_total: 22600,
        currency: "cad",
        payment_intent: `pi-${suffix}`,
        metadata: { tenantId: tenant.id, invoiceId: stripeInvoice.id, owingCents: "22600" },
      },
    },
  };
  const stripeFirst = await applyStripeCheckoutEvent(stripeEvent);
  const stripeDuplicate = await applyStripeCheckoutEvent(stripeEvent);
  assert.equal(stripeFirst.kind, "paid");
  assert.equal(stripeDuplicate.kind, "duplicate");
  assert.equal(await prisma.payment.count({ where: { tenantId: tenant.id, invoiceId: stripeInvoice.id } }), 1);
  assert.equal((await prisma.invoice.findUniqueOrThrow({ where: { id: stripeInvoice.id } })).status, "PAID");
  assert.equal(
    await prisma.inboundReceipt.count({ where: { tenantId: tenant.id, channel: "STRIPE_CHECKOUT", externalId: stripeEvent.id } }),
    1
  );

  const contract = await prisma.serviceContract.create({
    data: {
      tenantId: tenant.id,
      clientId: client.id,
      name: "Annual furnace service",
      visitMonths: "[10]",
      pricePerVisit: 189,
    },
  });
  const receiptResults = await Promise.allSettled([
    prisma.serviceVisitReceipt.create({ data: { tenantId: tenant.id, contractId: contract.id, cycle: "2026-10" } }),
    prisma.serviceVisitReceipt.create({ data: { tenantId: tenant.id, contractId: contract.id, cycle: "2026-10" } }),
  ]);
  assert.equal(receiptResults.filter((row) => row.status === "fulfilled").length, 1, "only one service visit claim may win");
  assert.equal(await prisma.serviceVisitReceipt.count({ where: { tenantId: tenant.id, contractId: contract.id, cycle: "2026-10" } }), 1);

  const parallelInvoices = await Promise.all(
    Array.from({ length: 4 }, (_, index) =>
      createNumberedInvoice(tenant.id, {
        projectId: project.id,
        clientName: project.clientName,
        address: project.address,
        lineItems: JSON.stringify([{ description: `Concurrency probe ${index + 1}`, qty: 1, unit: "ea", unitPrice: 1 }]),
        subtotal: 1,
        tax: 0.13,
        total: 1.13,
        status: "DRAFT",
      })
    )
  );
  assert.equal(new Set(parallelInvoices.map((row) => row.number)).size, 4, "parallel invoices need distinct human numbers");

  console.log("database regression passed", {
    leadId: lead.id,
    projectId: project.id,
    invoiceId: invoice.id,
    stripeInvoiceId: stripeInvoice.id,
    collected: 1356,
    ingressReceipts: 2,
  });
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
