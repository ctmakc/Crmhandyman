import { requireAdminPage } from "@/lib/page-guard";

export default async function OwnerOnlyLayout({ children }: { children: React.ReactNode }) {
  await requireAdminPage();
  return <>{children}</>;
}
