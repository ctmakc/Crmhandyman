import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { readEvidenceFile, removeEvidenceFile } from "@/lib/evidence-storage";
import { writeAuditEvent } from "@/lib/audit";

export const runtime = "nodejs";

async function resolveEvidence(projectId: string, evidenceId: string, tenantId: string) {
  return prisma.workEvidence.findFirst({
    where: { id: evidenceId, projectId, tenantId },
  });
}

export async function GET(
  _: NextRequest,
  props: { params: Promise<{ id: string; evidenceId: string }> }
) {
  const params = await props.params;
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tenantId = (session.user as any).tenantId as string;

  const evidence = await resolveEvidence(params.id, params.evidenceId, tenantId);
  if (!evidence) return NextResponse.json({ error: "Not found" }, { status: 404 });

  try {
    const body = await readEvidenceFile(evidence.storageKey);
    return new NextResponse(body, {
      headers: {
        "Content-Type": evidence.mimeType,
        "Content-Length": String(body.byteLength),
        "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(evidence.originalName)}`,
        "Cache-Control": "private, max-age=300",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    console.error("EVIDENCE_READ_FAILED", error);
    return NextResponse.json({ error: "Evidence file unavailable" }, { status: 404 });
  }
}

export async function DELETE(
  _: NextRequest,
  props: { params: Promise<{ id: string; evidenceId: string }> }
) {
  const params = await props.params;
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tenantId = (session.user as any).tenantId as string;

  const evidence = await resolveEvidence(params.id, params.evidenceId, tenantId);
  if (!evidence) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await prisma.workEvidence.delete({ where: { id: evidence.id } });
  await removeEvidenceFile(evidence.storageKey).catch((error) => console.error("EVIDENCE_DELETE_FILE_FAILED", error));
  await writeAuditEvent({
    tenantId,
    actorEmail: session.user?.email,
    action: "project.evidence_deleted",
    entityType: "project",
    entityId: params.id,
    summary: "Job evidence removed",
    metadata: { evidenceId: evidence.id, sha256: evidence.sha256, kind: evidence.kind },
  });

  return NextResponse.json({ ok: true });
}
