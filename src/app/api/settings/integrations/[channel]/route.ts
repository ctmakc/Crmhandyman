import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/guard";
import { tokenHint } from "@/lib/notify";
import { normalizeChannelAddress } from "@/lib/channel-address";

/**
 * The unique-index violation, read the way invoice-number.ts reads it: by code, not by
 * `instanceof`. The better-sqlite3 adapter throws the error across a module boundary
 * where the client class can differ, so the duck-typed code check is the one that holds.
 */
const isAddressTaken = (e: unknown) =>
  typeof e === "object" && e !== null && (e as { code?: string }).code === "P2002";

/**
 * A channel's credentials — the Facebook page token, the secret its webhook is verified
 * with, the page id.
 *
 * This route used to check that SOMEBODY was signed in and then serve the whole row, so
 * any hired tech with a login could read the shop's page token and forge webhook
 * deliveries with its secret. Two doors were open at once and both are shut here: the
 * guard is `requireAdmin`, and the secrets never ride in the body at all. The owner is
 * re-pasting a token he already has, not reading one back — so the answer says whether
 * one is on file and shows its last four characters, which is enough to tell two tokens
 * apart on screen.
 */

type Row = Awaited<ReturnType<typeof prisma.channelIntegration.findUnique>>;

/** The shape every answer from this route has. No secret is ever inside it. */
function publicView(channel: string, row: Row) {
  return {
    channel,
    isActive: row?.isActive ?? false,
    pageId: row?.pageId ?? null,
    config: row?.config ?? null,
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
  const keep = (raw: unknown) => (raw === undefined || raw === "" ? undefined : raw === null ? null : String(raw));

  const accessToken = keep(body.accessToken);
  const webhookSecret = keep(body.webhookSecret);
  const pageId = keep(body.pageId);
  const config = body.config ? JSON.stringify(body.config) : undefined;
  const isActive = typeof body.isActive === "boolean" ? body.isActive : undefined;

  /**
   * The email channel routes purely by the address a message was sent to, so an inbox is
   * a workspace-owning fact, not a preference: whoever claims leads-<slug>@… receives its
   * leads. Those addresses are guessable, so without a cross-tenant guard workspace B
   * could name workspace A's inbox and, the moment routing pointed there, harvest A's
   * enquiries. Only the email channel carries an address, and only when a fresh config is
   * being written — an untouched config leaves the stored claim exactly as it was.
   *
   * `undefined` = don't touch the column (blank field / non-email channel).
   * `null`      = config was written but names no address, releasing any prior claim.
   */
  const normalizedAddress =
    channel === "EMAIL" && body.config !== undefined ? normalizeChannelAddress(body.config) : undefined;

  // A clean 409 for the common case: some OTHER workspace already holds this address. The
  // unique index below is the real guard (it also catches the two-writers-at-once race
  // this lookup cannot see); this check just turns the expected collision into a plain
  // answer instead of a swallowed constraint error.
  if (normalizedAddress) {
    const claimant = await prisma.channelIntegration.findFirst({
      where: { normalizedAddress, tenantId: { not: tenantId } },
      select: { id: true },
    });
    if (claimant) {
      return NextResponse.json(
        { error: "That inbound address is already claimed by another workspace." },
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
    // The unique index fired: another workspace claimed this address between the check
    // above and this write. Same answer as the pre-check, now backed by the database.
    if (isAddressTaken(err)) {
      return NextResponse.json(
        { error: "That inbound address is already claimed by another workspace." },
        { status: 409 },
      );
    }
    throw err;
  }
}
