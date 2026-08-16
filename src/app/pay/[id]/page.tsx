import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { verifyPaymentLinkToken } from "@/lib/payment-links";
import { stripePaymentsConfigured } from "@/lib/stripe-payments";
import { formatCurrency } from "@/lib/utils";
import { buttonClass } from "@/components/ui/primitives";

export const dynamic = "force-dynamic";

export default async function PublicPaymentPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { token?: string; paid?: string; error?: string };
}) {
  const invoice = await prisma.invoice.findUnique({
    where: { id: params.id },
    include: {
      payments: { select: { amount: true } },
      tenant: { select: { businessName: true, plan: true, expiresAt: true } },
    },
  });
  if (!invoice) notFound();

  const token = searchParams.token || "";
  if (!verifyPaymentLinkToken({ tenantId: invoice.tenantId, invoiceId: invoice.id, token })) notFound();

  const expiredDemo =
    invoice.tenant.plan === "DEMO" && invoice.tenant.expiresAt && invoice.tenant.expiresAt.getTime() < Date.now();
  const amountPaid = invoice.payments.reduce((sum, payment) => sum + payment.amount, 0);
  const owing = Math.max(0, Math.round((invoice.total - amountPaid) * 100) / 100);
  const settled = invoice.status === "PAID" || owing <= 0.005;
  const unavailable = invoice.status === "VOID" || Boolean(expiredDemo) || !stripePaymentsConfigured();

  return (
    <main className="mx-auto min-h-screen max-w-2xl px-5 py-12 md:py-20">
      <div className="plate overflow-hidden">
        <div className="border-b border-line px-6 py-6 md:px-8">
          <div className="eyebrow">Secure invoice payment</div>
          <h1 className="mono mt-2 text-[28px] font-bold tracking-tight text-ink">{invoice.number}</h1>
          <p className="mt-3 text-[15px] font-bold text-ink">{invoice.tenant.businessName}</p>
          <p className="text-[13px] text-ink-2">For {invoice.clientName}</p>
        </div>

        <div className="px-6 py-6 md:px-8">
          <dl className="space-y-2 text-[14px]">
            <div className="flex justify-between gap-6">
              <dt className="text-ink-2">Invoice total</dt>
              <dd className="mono text-ink">{formatCurrency(invoice.total)}</dd>
            </div>
            {amountPaid > 0 && (
              <div className="flex justify-between gap-6">
                <dt className="text-ink-2">Already paid</dt>
                <dd className="mono" style={{ color: "var(--emerald-ink)" }}>−{formatCurrency(amountPaid)}</dd>
              </div>
            )}
            <div className="flex justify-between gap-6 border-t border-line pt-3">
              <dt className="font-bold uppercase tracking-[0.06em] text-ink">Amount due</dt>
              <dd className="mono text-[22px] font-bold text-ink">{formatCurrency(owing)}</dd>
            </div>
          </dl>

          {searchParams.paid === "1" && !settled && (
            <p className="mt-5 border-t border-line pt-4 text-[13px] text-ink-2">
              Payment was submitted. The invoice will update when the payment provider confirms it.
            </p>
          )}
          {searchParams.error && (
            <p className="mt-5 border-t border-line pt-4 text-[13px]" style={{ color: "var(--rose-ink)" }}>
              {searchParams.error}
            </p>
          )}

          {settled ? (
            <div className="mt-6 border-t border-line pt-5">
              <div className="eyebrow" style={{ color: "var(--emerald-ink)" }}>Paid</div>
              <p className="mt-2 text-[14px] text-ink-2">This invoice has been settled. Thank you.</p>
            </div>
          ) : unavailable ? (
            <div className="mt-6 border-t border-line pt-5">
              <div className="eyebrow">Online payment unavailable</div>
              <p className="mt-2 text-[14px] text-ink-2">
                Please use the payment instructions on the invoice or contact {invoice.tenant.businessName}.
              </p>
            </div>
          ) : (
            <form action="/api/payments/stripe/checkout" method="post" className="mt-6 border-t border-line pt-5">
              <input type="hidden" name="invoiceId" value={invoice.id} />
              <input type="hidden" name="token" value={token} />
              <button type="submit" className={`${buttonClass("primary")} w-full justify-center py-3 text-[14px]`}>
                Pay {formatCurrency(owing)} securely by card
              </button>
              <p className="mt-3 text-center text-[11px] text-ink-3">
                Card details are entered on Stripe Checkout and are not stored by HandymanPro.
              </p>
            </form>
          )}
        </div>
      </div>
    </main>
  );
}
