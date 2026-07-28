import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifySignedToken } from "@/lib/signed-token";

function redirect(req: NextRequest, path: string) {
  const configuredBase = process.env.NEXT_PUBLIC_SITE_URL;
  const base = configuredBase ? new URL(configuredBase) : req.nextUrl;
  return NextResponse.redirect(new URL(path, base));
}

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token") ?? "";
  const payload = verifySignedToken(token);

  if (
    !payload ||
    payload.purpose !== "worker-profile-verification" ||
    typeof payload.profileId !== "string" ||
    typeof payload.email !== "string"
  ) {
    return redirect(req, "/workers?verification=invalid");
  }

  const profile = await prisma.workerProfile.findFirst({
    where: {
      id: payload.profileId,
      email: payload.email.toLowerCase(),
      consentToPublic: true,
      consentToContact: true,
      verificationStatus: { not: "SUSPENDED" },
    },
    select: {
      id: true,
      slug: true,
      profileStatus: true,
    },
  });

  if (!profile) return redirect(req, "/workers?verification=invalid");

  if (profile.profileStatus === "DRAFT") {
    await prisma.workerProfile.update({
      where: { id: profile.id },
      data: { profileStatus: "PUBLISHED" },
    });
  } else if (profile.profileStatus !== "PUBLISHED") {
    return redirect(req, "/workers?verification=blocked");
  }

  return redirect(req, `/worker/${profile.slug}?verified=1`);
}
