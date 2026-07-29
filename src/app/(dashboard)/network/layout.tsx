import Link from "next/link";
import { Coins, Scale } from "lucide-react";

export default function NetworkLayout({ children }: { children: React.ReactNode }) {
  return (
    <div>
      <nav className="mb-6 flex flex-wrap gap-2" aria-label="Lead network sections">
        <Link
          href="/network"
          className="inline-flex items-center rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-black text-slate-800 shadow-sm hover:border-orange-300 hover:text-orange-700"
        >
          <Coins className="mr-2 h-4 w-4" />
          Exchange and wallet
        </Link>
        <Link
          href="/network/disputes"
          className="inline-flex items-center rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-black text-slate-800 shadow-sm hover:border-violet-300 hover:text-violet-700"
        >
          <Scale className="mr-2 h-4 w-4" />
          Disputes and evidence
        </Link>
      </nav>
      {children}
    </div>
  );
}
