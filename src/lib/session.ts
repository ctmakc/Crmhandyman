import "server-only";

import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export type AppSessionUser = {
  id: string;
  tenantId: string;
  role: "ADMIN" | "WORKER";
  name?: string | null;
  email?: string | null;
};

export async function getAppSessionUser(): Promise<AppSessionUser | null> {
  const session = await getServerSession(authOptions);
  const user = session?.user as Partial<AppSessionUser> | undefined;

  if (!user?.id || !user.tenantId || (user.role !== "ADMIN" && user.role !== "WORKER")) {
    return null;
  }

  return {
    id: user.id,
    tenantId: user.tenantId,
    role: user.role,
    name: user.name,
    email: user.email,
  };
}
