import { readFile } from "fs/promises";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/guard";
import { extensionFor, photoFilePath, removeStoredFile, type PhotoMime } from "@/lib/uploads";

/**
 * The only door to a stored photo. Files sit outside public/ so that this check —
 * signed in, and in the tenant that owns the shot — is unavoidable.
 */

export async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  const guard = await requireUser();
  if (!guard.ok) return guard.response;
  const { tenantId } = guard.identity;

  const photo = await prisma.jobPhoto.findFirst({
    where: { id: params.id, tenantId },
    select: { id: true, mime: true, path: true },
  });
  if (!photo) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const abs = photoFilePath(photo.path);
  if (!abs) return NextResponse.json({ error: "Not found" }, { status: 404 });

  let bytes: Buffer;
  try {
    bytes = await readFile(abs);
  } catch {
    // The row outlived its file. A 404 is honest; a 500 would send the crew hunting a bug.
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return new NextResponse(new Uint8Array(bytes), {
    headers: {
      "Content-Type": photo.mime,
      "Content-Length": String(bytes.length),
      "Content-Disposition": `inline; filename="${photo.id}.${extensionFor(photo.mime as PhotoMime) ?? "bin"}"`,
      // Private per session: a shared cache holding this would serve one contractor's
      // site photo to the next request that asked for the same URL.
      "Cache-Control": "private, no-store, max-age=0",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

export async function DELETE(_: NextRequest, { params }: { params: { id: string } }) {
  const guard = await requireUser();
  if (!guard.ok) return guard.response;
  const { tenantId, id: userId, role } = guard.identity;

  const photo = await prisma.jobPhoto.findFirst({
    where: { id: params.id, tenantId },
    select: { id: true, path: true, uploadedById: true },
  });
  if (!photo) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Proof of work is evidence: the owner can clear it, and so can the man who shot it
  // (a wrong photo taken thirty seconds ago). Nobody else on the crew.
  if (role !== "ADMIN" && photo.uploadedById !== userId) {
    return NextResponse.json({ error: "Not yours to delete" }, { status: 403 });
  }

  await prisma.jobPhoto.deleteMany({ where: { id: photo.id, tenantId } });
  // Row first: an unreachable file is waste, a row pointing at nothing is a broken photo.
  await removeStoredFile(photo.path);

  return NextResponse.json({ ok: true });
}
