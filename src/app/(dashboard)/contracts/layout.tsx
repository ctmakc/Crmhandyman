import { requireAdminPage } from "@/lib/page-guard";

/**
 * The maintenance book prices every plan on it, so it belongs with the other money
 * screens. The API refuses the crew now; a hidden link is not a closed door, and a tech
 * who types /contracts lands back on his board.
 */
export default async function OwnerOnlyLayout({ children }: { children: React.ReactNode }) {
  await requireAdminPage();
  return <>{children}</>;
}
