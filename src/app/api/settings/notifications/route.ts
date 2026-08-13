import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/guard";
import { record } from "@/lib/audit";
import {
  flushPending,
  readNotificationSettings,
  sendTestNotification,
  writeNotificationSettings,
} from "@/lib/notify";

/**
 * Who gets told about a new lead, and when.
 *
 * Admins only. The row holds a bot token — a write credential for the owner's own
 * Telegram chat — which puts it on the same shelf as the crew list and the intake keys.
 * The token is never in a response: the payload carries `telegramTokenHint` instead.
 */

export async function GET() {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  return NextResponse.json(await readNotificationSettings(guard.identity.tenantId));
}

export async function PUT(req: NextRequest) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;
  const { tenantId, id: actorId } = guard.identity;

  const body = await req.json().catch(() => ({}));
  const result = await writeNotificationSettings(tenantId, body);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });

  if (result.changed.length) {
    await record({
      tenantId,
      actor: { id: actorId },
      action: "notify.settings",
      entity: "Tenant",
      entityId: tenantId,
      // The token itself never reaches the journal — only the fact that it changed.
      summary: `Changed new-lead alerts (${result.changed.join(", ")})`,
    });
  }

  // A save is the moment a broken channel gets fixed, so it is also the moment anything
  // held — by quiet hours or by a refused token — gets its chance to go out.
  if (result.settings.isActive) void flushPending(tenantId);

  return NextResponse.json(result.settings);
}

/** «Send a test» — the owner is holding the phone, so it ignores quiet hours. */
export async function POST() {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;
  const { tenantId, id: actorId } = guard.identity;

  const result = await sendTestNotification(tenantId);

  await record({
    tenantId,
    actor: { id: actorId },
    action: "notify.test",
    entity: "Tenant",
    entityId: tenantId,
    summary: result.ok
      ? `Sent a test lead alert: ${result.detail}`
      : `Test lead alert failed: ${result.detail}`,
  });

  return NextResponse.json(result);
}
