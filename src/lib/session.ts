import type { Session } from "next-auth";

export type SessionIdentity = {
  id: string;
  tenantId: string;
  tenantSlug: string;
  role: "ADMIN" | "WORKER";
};

/**
 * The session is the only trustworthy source of the tenant. Routes used to reach for
 * `(session.user as any).tenantId` in thirty places; one of them forgetting is a leak,
 * so the read lives here.
 */
export function sessionTenant(session: Session): SessionIdentity {
  const u = session.user as unknown as Partial<SessionIdentity> | undefined;
  return {
    id: u?.id ?? "",
    tenantId: u?.tenantId ?? "",
    tenantSlug: u?.tenantSlug ?? "",
    role: u?.role === "ADMIN" ? "ADMIN" : "WORKER",
  };
}

export function isAdmin(session: Session | null): boolean {
  return !!session && sessionTenant(session).role === "ADMIN";
}
