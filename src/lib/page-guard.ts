import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { sessionTenant } from "@/lib/session";

/**
 * Server-side gate for the owner's screens. The rail already hides them, but a hidden
 * link is not a closed door — a worker who types /finance must land back on the board.
 */
export async function requireAdminPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  const identity = sessionTenant(session);
  // A revoked session carries no identity (the user row is gone) — back to the door.
  if (!identity.id) redirect("/login");
  if (identity.role !== "ADMIN") redirect("/today");

  return identity;
}
