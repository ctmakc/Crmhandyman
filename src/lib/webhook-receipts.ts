import "server-only";

import { createHash, randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

type WebhookWriter = Pick<Prisma.TransactionClient, "$executeRaw" | "$queryRaw">;

type ReceiptRow = {
  id: string;
  attempts: number | bigint;
  status: string;
};

function clean(value: string | null | undefined, maxLength: number) {
  return (value ?? "").trim().slice(0, maxLength) || null;
}

export function payloadSha256(payload: string) {
  return createHash("sha256").update(payload, "utf8").digest("hex");
}

export async function receiveWebhookEvent(input: {
  provider: string;
  eventId: string;
  eventType: string;
  objectId?: string | null;
  payload: string;
  livemode?: boolean;
}) {
  const provider = clean(input.provider, 60);
  const eventId = clean(input.eventId, 240);
  const eventType = clean(input.eventType, 160);
  if (!provider || !eventId || !eventType) {
    throw new Error("Webhook provider, event ID and type are required.");
  }

  const rows = await prisma.$queryRaw<ReceiptRow[]>(Prisma.sql`
    INSERT INTO WebhookReceipt (
      "id", "provider", "eventId", "eventType", "objectId", "payloadSha256",
      "livemode", "status", "attempts", "receivedAt", "updatedAt"
    ) VALUES (
      ${randomUUID()}, ${provider}, ${eventId}, ${eventType}, ${clean(input.objectId, 240)},
      ${payloadSha256(input.payload)}, ${input.livemode === true}, 'RECEIVED', 1,
      CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
    )
    ON CONFLICT("provider", "eventId") DO UPDATE SET
      "eventType" = excluded."eventType",
      "objectId" = excluded."objectId",
      "payloadSha256" = excluded."payloadSha256",
      "livemode" = excluded."livemode",
      "attempts" = WebhookReceipt."attempts" + 1,
      "updatedAt" = CURRENT_TIMESTAMP
    RETURNING "id", "attempts", "status"
  `);

  const row = rows[0];
  if (!row) throw new Error("Unable to persist webhook receipt.");
  return { id: row.id, attempts: Number(row.attempts), status: row.status };
}

export async function updateWebhookReceipt(
  receiptId: string,
  input: {
    status: "RECEIVED" | "PROCESSED" | "IGNORED" | "FAILED";
    lastError?: string | null;
  },
  db: WebhookWriter = prisma
) {
  const processedAt = input.status === "PROCESSED" || input.status === "IGNORED" ? new Date() : null;
  await db.$executeRaw(Prisma.sql`
    UPDATE WebhookReceipt
    SET "status" = ${input.status},
        "lastError" = ${clean(input.lastError, 4000)},
        "processedAt" = ${processedAt},
        "updatedAt" = CURRENT_TIMESTAMP
    WHERE "id" = ${receiptId}
  `);
}
