import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/guard";
import { smtpConfigured } from "@/lib/mailer";
import { smsFromNumber } from "@/lib/sms";

/**
 * One answer for the whole channels desk: which integrations can actually receive or
 * send right now, and why the ones that cannot, cannot.
 *
 * The tenant half lives in ChannelIntegration. The server half is environment an admin
 * cannot inspect from the browser (Meta verification, Mailgun signing and SMTP). Secret
 * values never ship here — presence is enough for the readiness stub.
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
  const sms = byChannel.get("SMS");

  return NextResponse.json({
    server: {
      metaAppSecret: Boolean(process.env.META_APP_SECRET),
      metaVerifyToken: Boolean(process.env.META_WEBHOOK_VERIFY_TOKEN),
      mailgunSigningKey: Boolean(process.env.MAILGUN_WEBHOOK_SIGNING_KEY),
      smtpOutbound: smtpConfigured(),
    },
    channels: {
      FACEBOOK: channel("FACEBOOK"),
      INSTAGRAM: channel("INSTAGRAM"),
      GOOGLE: channel("GOOGLE"),
      EMAIL: {
        isActive: email?.isActive ?? false,
        inboundAddress: inboundAddress(email?.config ?? null),
      },
      SMS: {
        ...channel("SMS"),
        /** The sending number is routing data; the auth token itself never leaves storage. */
        fromNumber: sms?.normalizedAddress ?? smsFromNumber(sms?.config ?? null),
      },
    },
  });
}
