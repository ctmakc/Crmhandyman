import "server-only";

import { getAppSessionUser } from "@/lib/session";

export function configuredSuperAdminEmails() {
  return new Set(
    (process.env.SUPER_ADMIN_EMAILS ?? "")
      .split(",")
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean)
  );
}

export function isSuperAdminEmail(email: string | null | undefined) {
  return Boolean(email && configuredSuperAdminEmails().has(email.toLowerCase()));
}

export async function getSuperAdminUser() {
  const user = await getAppSessionUser();
  return user && isSuperAdminEmail(user.email) ? user : null;
}
