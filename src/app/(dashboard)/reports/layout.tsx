import { requireAdminPage } from "@/lib/page-guard";

/** What a channel returned is the books read sideways — the owner's desk, not the crew's. */
export default async function OwnerOnlyLayout({ children }: { children: React.ReactNode }) {
  await requireAdminPage();
  return <>{children}</>;
}
