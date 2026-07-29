import type { Metadata } from "next";
import CreditPurchasePanel from "@/components/network/CreditPurchasePanel";
import CreditWalletPanel from "@/components/network/CreditWalletPanel";
import LeadNetwork from "@/components/network/LeadNetwork";

export const metadata: Metadata = {
  title: "Lead Network",
};

export default function NetworkPage({ searchParams }: { searchParams: { publishLead?: string } }) {
  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-6">
        <p className="text-xs font-black uppercase tracking-[0.18em] text-orange-600">
          Contractor-to-contractor exchange
        </p>
        <h1 className="mt-2 text-3xl font-black text-slate-950">Lead Network</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">
          Send overflow work to other contractors instead of discarding it. Customer contacts remain
          private until the owner approves a request and the claimant unlocks it.
        </p>
      </div>
      <CreditWalletPanel />
      <CreditPurchasePanel />
      <LeadNetwork initialLeadId={searchParams.publishLead ?? ""} />
    </div>
  );
}
