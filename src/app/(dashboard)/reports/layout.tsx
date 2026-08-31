import Link from "next/link";
import { requireAdminPage } from "@/lib/page-guard";
import { buttonClass } from "@/components/ui/primitives";

/** What a channel returned is the books read sideways — the owner's desk, not the crew's. */
export default async function OwnerOnlyLayout({ children }: { children: React.ReactNode }) {
  await requireAdminPage();
  return (
    <div>
      <nav aria-label="Reports" className="mb-6 flex flex-wrap gap-2 border-b border-line pb-3">
        <Link href="/reports" className={buttonClass("ghost")}>
          Source report
        </Link>
        <Link href="/reports/meta" className={buttonClass("ghost")}>
          Meta campaigns
        </Link>
      </nav>
      {children}
    </div>
  );
}
