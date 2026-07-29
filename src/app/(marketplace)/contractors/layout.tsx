import Link from "next/link";
import { Crosshair, Search, Send } from "lucide-react";

export default function ContractorsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div>
      <nav className="border-b border-slate-200 bg-white" aria-label="Contractor marketplace sections">
        <div className="mx-auto flex max-w-7xl flex-wrap gap-2 px-4 py-3 sm:px-6">
          <Link
            href="/contractors"
            className="inline-flex items-center rounded-lg px-3 py-2 text-sm font-black text-slate-700 hover:bg-orange-50 hover:text-orange-700"
          >
            <Search className="mr-2 h-4 w-4" />
            Directory search
          </Link>
          <Link
            href="/contractors/nearby"
            className="inline-flex items-center rounded-lg px-3 py-2 text-sm font-black text-slate-700 hover:bg-orange-50 hover:text-orange-700"
          >
            <Crosshair className="mr-2 h-4 w-4" />
            Near me
          </Link>
          <Link
            href="/hire"
            className="inline-flex items-center rounded-lg px-3 py-2 text-sm font-black text-slate-700 hover:bg-orange-50 hover:text-orange-700"
          >
            <Send className="mr-2 h-4 w-4" />
            Post a project
          </Link>
        </div>
      </nav>
      {children}
    </div>
  );
}
