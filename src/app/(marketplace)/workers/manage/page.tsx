import type { Metadata } from "next";
import Link from "next/link";
import WorkerManageRequestForm from "@/components/marketplace/WorkerManageRequestForm";
import WorkerProfileManager from "@/components/marketplace/WorkerProfileManager";
import { prisma } from "@/lib/prisma";
import { verifySignedToken } from "@/lib/signed-token";

export const metadata: Metadata = {
  title: "Manage worker profile",
  robots: { index: false, follow: false, noarchive: true },
  referrer: "no-referrer",
};

export const dynamic = "force-dynamic";

export default async function WorkerManagePage({
  searchParams,
}: {
  searchParams: { token?: string };
}) {
  const token = searchParams.token ?? "";
  const payload = token ? verifySignedToken(token) : null;

  const validPayload =
    payload?.purpose === "worker-profile-manage" &&
    typeof payload.profileId === "string" &&
    typeof payload.email === "string";

  const profile = validPayload
    ? await prisma.workerProfile.findFirst({
        where: {
          id: payload.profileId as string,
          email: (payload.email as string).toLowerCase(),
          verificationStatus: { not: "SUSPENDED" },
        },
        select: {
          slug: true,
          email: true,
          fullName: true,
          publicName: true,
          phone: true,
          city: true,
          province: true,
          headline: true,
          summary: true,
          yearsExperience: true,
          employmentTypes: true,
          hourlyRateMin: true,
          hourlyRateMax: true,
          hasVehicle: true,
          hasTools: true,
          languages: true,
          availability: true,
          resumeUrl: true,
          consentToContact: true,
          consentToPublic: true,
          profileStatus: true,
          skills: {
            select: { name: true },
            orderBy: { name: "asc" },
          },
        },
      })
    : null;

  return (
    <main className="mx-auto max-w-4xl px-4 py-12 sm:px-6">
      <Link href="/workers" className="text-sm font-bold text-slate-500 hover:text-slate-900">
        ← Back to worker directory
      </Link>

      <div className="mt-8">
        {profile && validPayload ? (
          <WorkerProfileManager
            token={token}
            profile={{
              ...profile,
              employmentTypes: profile.employmentTypes
                .split(",")
                .map((value) => value.trim())
                .filter(Boolean),
            }}
          />
        ) : (
          <div className="mx-auto max-w-xl">
            <WorkerManageRequestForm
              errorMessage={token ? "This management link is invalid or expired. Request a new one." : ""}
            />
          </div>
        )}
      </div>
    </main>
  );
}
