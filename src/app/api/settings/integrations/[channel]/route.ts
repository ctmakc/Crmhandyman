import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/guard";
import { tokenHint } from "@/lib/notify";
import { normalizeChannelAddress } from "@/lib/channel-address";
import { smsFromNumber } from "@/lib/sms";
import { META_ADS_CHANNEL, normalizeMetaAdAccountId } from "@/lib/meta-ads";

/**
 * The unique-index violation, read the way invoice-number.ts reads it: by code, not by
 * `instanceof`. The better-sqlite3 adapter throws the error across a module boundary
 * where the client class can differ, so the duck-typed code check is the one that holds.
 */
const isAddressTaken = (e: unknown) =>
  typeof e === "object" && e !== null && (e as { code?: string }).code === "P2002";

/**
 * A channel's credentials — the Facebook page token, Twilio auth token, webhook secret,
 * provider account id and non-secret routing config.
 *
 * This route used to check that SOMEBODY was signed in and then serve the whole row, so
 * any hired tech with a login could read a channel token. The guard is admin-only and
 * secrets never ride back in the body: the owner re-pastes a token, while the screen only
 * sees whether one exists and its last four characters.
 */

type Row = Awaited<ReturnType<typeof prisma.channelIntegration.findUnique>>;

/** The shape every answer from this route has. No secret is ever inside it. */
function publicView(channel: string, row: Row) {
  return {
    channel,
    isActive: row?.isActive ?? false,
    pageId: row?.pageId ?? null,
    config: row?.config ?? null,
    normalizedAddress: row?.normalizedAddress ?? null,
    hasAccessToken: Boolean(row?.accessToken),
    hasWebhookSecret: Boolean(row?.webhookSecret),
    accessTokenHint: tokenHint(row?.accessToken),
    lastSyncAt: row?.lastSyncAt ?? null,
  };
}

export async function GET(_: NextRequest, { params }: { params: { channel: string } }) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;
  const { tenantId } = guard.identity;

  const channel = params.channel.toUpperCase();
  const integration = await prisma.channelIntegration.findUnique({
    where: { tenantId_channel: { tenantId, channel } },
  });

  return NextResponse.json(publicView(channel, integration));
}

export async function PUT(req: NextRequest, { params }: { params: { channel: string } }) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;
  const { tenantId } = guard.identity;

  const body = await req.json();
  const channel = params.channel.toUpperCase();

  /**
   * A blank field means "leave what is stored alone", because the form cannot show the
   * owner what is stored. `null` is how he clears one on purpose.
   */
  const keep = (raw: unknown) =>
    raw === undefined || raw === "" ? undefined : raw === null ? null : String(raw);

  const accessToken = keep(body.accessToken);
  const webhookSecret = keep(body.webhookSecret);
  let pageId = keep(body.pageId);
  const config =
    body.config === undefined || body.config === ""
      ? undefined
      : body.config === null
        ? null
        : JSON.stringify(body.config);
  const isActive = typeof body.isActive === "boolean" ? body.isActive : undefined;

  // Ads Manager commonly prints `act_123…`, while Graph routes need the digits. Fail on
  // save rather than letting a malformed account id sit quietly until the first spend sync.
  if (channel === META_ADS_CHANNEL && typeof pageId === "string") {
    const normalized = normalizeMetaAdAccountId(pageId);
    if (!normalized) {
      return NextResponse.json(
        { error: "Meta ad account ID must be digits or act_<digits>", field: "pageId" },
        { status: 400 },
      );
    }
    pageId = normalized;
  }

  /**
   * Two channels route inbound traffic by an address owned by exactly one workspace:
   * email by recipient address, SMS by the Twilio number the customer replied to.
   * `normalizedAddress` has a global unique index, so even two simultaneous saves cannot
   * make two tenants claim one inbox/number.
   *
   * undefined = don't touch the stored claim; null = explicitly release it.
   */
  let normalizedAddress: string | null | undefined;
  if (body.config !== undefined && body.config !== "") {
    normalizedAddress =
      channel === "EMAIL"
        ? normalizeChannelAddress(body.config)
        : channel === "SMS"
          ? smsFromNumber(body.config)
          : undefined;
  }

  if (channel === "SMS" && body.config !== undefined && body.config !== "" && body.config !== null && !normalizedAddress) {
    return NextResponse.json(
      { error: "Twilio phone number must be a valid E.164 or Canadian/US 10-digit number", field: "config" },
      { status: 400 },
    );
  }

  // A clean 409 for the common case. The unique index below remains the real race-proof guard.
  if (normalizedAddress) {
    const claimant = await prisma.channelIntegration.findFirst({
      where: { normalizedAddress, tenantId: { not: tenantId } },
      select: { id: true },
    });
    if (claimant) {
      return NextResponse.json(
        { error: "That channel address is already claimed by another workspace." },
        { status: 409 },
      );
    }
  }

  try {
    const integration = await prisma.channelIntegration.upsert({
      where: { tenantId_channel: { tenantId, channel } },
      update: { accessToken, pageId, webhookSecret, config, isActive, normalizedAddress },
      create: {
        tenantId,
        channel,
        accessToken: accessToken ?? null,
        pageId: pageId ?? null,
        webhookSecret: webhookSecret ?? null,
        config,
        isActive: isActive ?? true,
        normalizedAddress: normalizedAddress ?? null,
      },
    });

    return NextResponse.json(publicView(channel, integration));
  } catch (err) {
    if (isAddressTaken(err)) {
      return NextResponse.json(
        { error: "That channel address is already claimed by another workspace." },
        { status: 409 },
      );
    }
    throw err;
  }
}
