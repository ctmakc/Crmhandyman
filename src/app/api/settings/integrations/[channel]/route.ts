import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/guard";
import { tokenHint } from "@/lib/notify";

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

  const integration = await prisma.channelIntegration.upsert({
    where: { tenantId_channel: { tenantId, channel } },
    update: { accessToken, pageId, webhookSecret, config, isActive },
    create: {
      tenantId,
      channel,
      accessToken: accessToken ?? null,
      pageId: pageId ?? null,
      webhookSecret: webhookSecret ?? null,
      config,
      isActive: isActive ?? true,
    },
  });

  return NextResponse.json(publicView(channel, integration));
}
