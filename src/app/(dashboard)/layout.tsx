import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { sessionTenant } from "@/lib/session";
import Sidebar from "@/components/layout/Sidebar";
import TopBar from "@/components/layout/TopBar";
import DemoBanner from "@/components/DemoBanner";
import OfflineBar from "@/components/OfflineBar";
import QuickJump from "@/components/QuickJump";
import Toaster from "@/components/ui/Toaster";

/**
 * «Add to home screen» starts here rather than in the root layout: the thing worth
 * installing on a phone is the desk itself, and a visitor sitting on the login form has
 * nothing to install yet. Colours and icons live in public/manifest.json.
 */
export const metadata = {
  manifest: "/manifest.json",
  appleWebApp: { capable: true, title: "HandymanPro", statusBarStyle: "default" as const },
  icons: { apple: "/icons/apple-touch-icon.png" },
};

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  // Whose desk this is. The rail said HANDYMANPRO and nothing else, so a contractor
  // signing in for the first time saw a product, not his own shop.
  const { tenantId } = sessionTenant(session);
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { businessName: true },
  });

  return (
    <div className="flex h-screen bg-deck">
      <Sidebar business={tenant?.businessName ?? null} />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar user={session.user} />
        <DemoBanner />
        {/* Registers the field service worker, and reports anything the phone is
            holding back. Silent whenever the network is fine and nothing is queued. */}
        <OfflineBar />
        <main className="deck-grid flex-1 overflow-auto px-4 py-6 md:px-8 md:py-8">{children}</main>
      </div>
      <QuickJump />
      <Toaster />
    </div>
  );
}
