import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { persistEvidenceFile, removeEvidenceFile } from "@/lib/evidence-storage";
import { writeAuditEvent } from "@/lib/audit";

export const runtime = "nodejs";

const EVIDENCE_KINDS = new Set(["BEFORE", "AFTER", "OTHER"]);

export async function GET(_: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tenantId = (session.user as any).tenantId as string;

  const project = await prisma.project.findFirst({ where: { id: params.id, tenantId }, select: { id: true } });
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const evidence = await prisma.workEvidence.findMany({
    where: { tenantId, projectId: project.id },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      kind: true,
      originalName: true,
      mimeType: true,
      byteSize: true,
      caption: true,
      capturedAt: true,
      createdBy: true,
      createdAt: true,
    },
  });

  return NextResponse.json(
    evidence.map((item) => ({
      ...item,
      contentUrl: `/api/projects/${project.id}/evidence/${item.id}`,
    })),
    { headers: { "Cache-Control": "no-store" } }
  );
}

export async function POST(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tenantId = (session.user as any).tenantId as string;

  const project = await prisma.project.findFirst({
    where: { id: params.id, tenantId },
    select: { id: true, title: true },
  });
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const form = await req.formData();
  const upload = form.get("file");
  if (!(upload instanceof File)) return NextResponse.json({ error: "file required" }, { status: 400 });

  const requestedKind = String(form.get("kind") ?? "OTHER").toUpperCase();
  const kind = EVIDENCE_KINDS.has(requestedKind) ? requestedKind : "OTHER";
  const caption = String(form.get("caption") ?? "").trim().slice(0, 500) || null;
  const capturedValue = String(form.get("capturedAt") ?? "").trim();
  const capturedAt = capturedValue && !Number.isNaN(new Date(capturedValue).getTime()) ? new Date(capturedValue) : null;
  const bytes = Buffer.from(await upload.arrayBuffer());

  let stored: Awaited<ReturnType<typeof persistEvidenceFile>>;
  try {
    stored = await persistEvidenceFile({ tenantId, projectId: project.id, mimeType: upload.type, bytes });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Invalid image" }, { status: 400 });
  }

  try {
    const evidence = await prisma.workEvidence.create({
      data: {
        tenantId,
        projectId: project.id,
        kind: kind as never,
        storageKey: stored.storageKey,
        originalName: upload.name.slice(0, 255) || "job-photo",
        mimeType: upload.type,
        byteSize: stored.byteSize,
        sha256: stored.sha256,
        caption,
        capturedAt,
        createdBy: session.user?.email ?? null,
      },
      select: { id: true, kind: true, caption: true, createdAt: true },
    });

    await writeAuditEvent({
      tenantId,
      actorEmail: session.user?.email,
      action: "project.evidence_added",
      entityType: "project",
      entityId: project.id,
      summary: `${kind.toLowerCase()} evidence added to ${project.title}`,
      metadata: { evidenceId: evidence.id, byteSize: stored.byteSize, sha256: stored.sha256 },
    });

    return NextResponse.json(
      { ...evidence, contentUrl: `/api/projects/${project.id}/evidence/${evidence.id}` },
      { status: 201 }
    );
  } catch (error) {
    await removeEvidenceFile(stored.storageKey).catch(() => null);
    console.error("EVIDENCE_METADATA_WRITE_FAILED", error);
    return NextResponse.json({ error: "Could not save evidence" }, { status: 500 });
  }
}
