import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/guard";
import { smtpConfigured } from "@/lib/mailer";

/**
 * One answer for the whole intake desk: which channels can actually receive a lead
 * right now, and why the ones that can't, can't.
 *
 * Readiness has two halves that live in different places. The tenant's half is his
 * ChannelIntegration row — token on file, page id, the forwarding address. The server's
 * half is environment the owner cannot see from a browser: the Meta app secret every
 * webhook delivery is signature-checked against, the verify token Meta's subscription
 * handshake needs, the Mailgun signing key, the SMTP account outbound mail leaves
 * through. Without this route the settings screen could only say "saved" — and a saved
 * token on a server with no META_APP_SECRET receives exactly nothing, because the
 * webhook fails closed (see src/app/api/webhooks/facebook/route.ts).
 *
 * The env facts ship as BOOLEANS only. The values are secrets; presence is not.
 */

/**
 * The same parse the email webhook routes inbound mail with
 * (configuredAddress in src/app/api/webhooks/email/route.ts) — the two must agree,
 * or this screen would call an address "ready" that the webhook cannot match.
 * The settings form has stored it both as a bare string and as JSON over time.
 */
function inboundAddress(config: string | null): string | null {
  if (!config) return null;
  let value: unknown = config;
  try {
    value = JSON.parse(config);
  } catch {
    /* stored as a bare string */
  }
  if (typeof value === "string") return value.trim().toLowerCase() || null;
  if (value && typeof value === "object") {
    const address =
      (value as { address?: string; email?: string }).address ??
      (value as { email?: string }).email;
    return address ? address.trim().toLowerCase() : null;
  }
  return null;
}

export async function GET() {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;
  const { tenantId } = guard.identity;

  const rows = await prisma.channelIntegration.findMany({ where: { tenantId } });
  const byChannel = new Map(rows.map((r) => [r.channel, r]));

  const channel = (name: string) => {
    const row = byChannel.get(name);
    return {
      isActive: row?.isActive ?? false,
      hasAccessToken: Boolean(row?.accessToken),
      hasPageId: Boolean(row?.pageId),
    };
  };

  const email = byChannel.get("EMAIL");

  return NextResponse.json({
    server: {
      /**
       * What the Meta webhooks actually read: META_APP_SECRET verifies every delivery
       * (unset = all deliveries refused), META_WEBHOOK_VERIFY_TOKEN answers the
       * subscription handshake. There is no META_APP_ID in this codebase's path.
       */
      metaAppSecret: Boolean(process.env.META_APP_SECRET),
      metaVerifyToken: Boolean(process.env.META_WEBHOOK_VERIFY_TOKEN),
      /** Unset means the email webhook refuses every inbound message — it fails closed. */
      mailgunSigningKey: Boolean(process.env.MAILGUN_WEBHOOK_SIGNING_KEY),
      /** Estimates, invoices and reminders leave through this; boolean of SMTP_HOST/USER/PASS. */
      smtpOutbound: smtpConfigured(),
    },
    channels: {
      FACEBOOK: channel("FACEBOOK"),
      INSTAGRAM: channel("INSTAGRAM"),
      GOOGLE: channel("GOOGLE"),
      EMAIL: {
        isActive: email?.isActive ?? false,
        /** The admin typed this address himself; it is routing data, not a secret. */
        inboundAddress: inboundAddress(email?.config ?? null),
      },
    },
  });
}
