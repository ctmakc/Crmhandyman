import { NextRequest, NextResponse } from "next/server";
import { PhotoKind, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/guard";
import {
  maxPhotosPerJob,
  maxUploadBytes,
  removeStoredFile,
  sniffImageMime,
  storeJobPhoto,
} from "@/lib/uploads";
import { declaredTooLarge } from "@/lib/request-body";

/**
 * Before/after shots on a job. The whole crew uploads — the man holding the phone in
 * the driveway is the one who took the photo — while reading and deleting stay scoped
 * to the tenant and to the uploader.
 */

const KINDS = Object.values(PhotoKind) as string[];
const CAPTION_MAX = 160;

/** Never ship the storage path to the browser; the id is the only handle a client needs. */
const PHOTO_FIELDS = {
  id: true,
  kind: true,
  caption: true,
  mime: true,
  sizeBytes: true,
  uploadedById: true,
  createdAt: true,
} satisfies Prisma.JobPhotoSelect;

export async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  const guard = await requireUser();
  if (!guard.ok) return guard.response;
  const { tenantId, id: userId, role } = guard.identity;

  const project = await prisma.project.findFirst({
    where: { id: params.id, tenantId },
    select: { id: true },
  });
  if (!project) return NextResponse.json({ error: "That record is gone — it was deleted, or the link points at another workspace" }, { status: 404 });

  const photos = await prisma.jobPhoto.findMany({
    where: { tenantId, projectId: project.id },
    select: PHOTO_FIELDS,
    orderBy: { createdAt: "asc" },
  });

  // Who shot it, by name — a photo with no author proves nothing in a dispute.
  const shooters = await prisma.user.findMany({
    where: { tenantId, id: { in: Array.from(new Set(photos.map((p) => p.uploadedById))) } },
    select: { id: true, name: true },
  });
  const names = new Map(shooters.map((u) => [u.id, u.name]));

  return NextResponse.json(
    photos.map((p) => ({
      ...p,
      uploadedBy: names.get(p.uploadedById) ?? null,
      canDelete: role === "ADMIN" || p.uploadedById === userId,
    }))
  );
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const guard = await requireUser();
  if (!guard.ok) return guard.response;
  const { tenantId, id: userId } = guard.identity;

  const project = await prisma.project.findFirst({
    where: { id: params.id, tenantId },
    select: { id: true },
  });
  if (!project) return NextResponse.json({ error: "That record is gone — it was deleted, or the link points at another workspace" }, { status: 404 });

  const limit = maxUploadBytes();
  // Refuse on the declared size first. Past this line the multipart parser holds the
  // whole upload in memory, so checking file.size afterwards is already too late.
  if (declaredTooLarge(req, limit + 64 * 1024)) {
    return NextResponse.json(
      { error: `Photo is over the ${Math.round(limit / (1024 * 1024))} MB limit` },
      { status: 413 }
    );
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "No photo came with that request" }, { status: 400 });
  }

  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: "No file attached" }, { status: 400 });
  }

  if (file.size > limit) {
    return NextResponse.json(
      { error: `Photo is over the ${Math.round(limit / (1024 * 1024))} MB limit` },
      { status: 413 }
    );
  }

  const perJob = maxPhotosPerJob();
  const existing = await prisma.jobPhoto.count({ where: { tenantId, projectId: project.id } });
  if (existing >= perJob) {
    return NextResponse.json(
      { error: `This job already holds ${perJob} photos` },
      { status: 409 }
    );
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  // file.size is the client's claim; the buffer is the truth.
  if (bytes.length > limit) {
    return NextResponse.json({ error: "Photo is over the size limit" }, { status: 413 });
  }

  const mime = sniffImageMime(bytes);
  if (!mime) {
    return NextResponse.json(
      { error: "Only JPEG, PNG, WebP or HEIC photos are accepted" },
      { status: 415 }
    );
  }

  const rawKind = String(form.get("kind") ?? PhotoKind.BEFORE);
  const kind = (KINDS.includes(rawKind) ? rawKind : PhotoKind.BEFORE) as PhotoKind;
  const caption = String(form.get("caption") ?? "").trim().slice(0, CAPTION_MAX);

  const key = await storeJobPhoto({ tenantId, projectId: project.id, mime, bytes });

  try {
    const photo = await prisma.jobPhoto.create({
      data: {
        tenantId,
        projectId: project.id,
        kind,
        path: key,
        mime,
        sizeBytes: bytes.length,
        caption: caption || null,
        uploadedById: userId,
      },
      select: PHOTO_FIELDS,
    });
    return NextResponse.json({ ...photo, uploadedBy: null, canDelete: true }, { status: 201 });
  } catch (err) {
    // The row is the index of the disk. A write that never got one leaves a file nobody
    // can reach or delete, so it goes back out immediately.
    await removeStoredFile(key).catch(() => null);
    throw err;
  }
}
