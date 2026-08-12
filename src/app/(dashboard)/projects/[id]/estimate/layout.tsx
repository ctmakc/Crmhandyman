import { requireAdminPage } from "@/lib/page-guard";

/** Pricing a job is the owner's desk, the same as the books and the invoices. */
export default async function OwnerOnlyLayout({ children }: { children: React.ReactNode }) {
  await requireAdminPage();
  return <>{children}</>;
}
