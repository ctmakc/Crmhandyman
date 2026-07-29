import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import NetworkDisputesManager from "@/components/network/NetworkDisputesManager";

export const metadata: Metadata = {
  title: "Lead Network Disputes",
};

export default function NetworkDisputesPage() {
  return (
    <div className="mx-auto max-w-6xl">
      <Link
        href="/network"
        className="inline-flex items-center text-sm font-bold text-slate-500 hover:text-slate-900"
      >
        <ArrowLeft className="mr-1.5 h-4 w-4" />
        Back to lead network
      </Link>
      <div className="mb-6 mt-6">
        <p className="text-xs font-black uppercase tracking-[0.18em] text-amber-600">
          Evidence and resolution
        </p>
        <h1 className="mt-2 text-3xl font-black text-slate-950">Network disputes</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">
          Open one case per lead claim, attach evidence links, respond to the other party and track the
          72-hour moderation SLA. Refunds can only be issued through a recorded resolution.
        </p>
      </div>
      <NetworkDisputesManager />
    </div>
  );
}
