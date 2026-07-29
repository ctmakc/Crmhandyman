import "server-only";

export type CreditPack = {
  id: string;
  label: string;
  credits: number;
  priceId: string;
  amountCents: number;
  currency: string;
  description: string | null;
};

function text(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

export function getCreditPacks(): CreditPack[] {
  const raw = process.env.STRIPE_CREDIT_PACKS_JSON;
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    const packs = parsed
      .map((item): CreditPack | null => {
        if (!item || typeof item !== "object") return null;
        const record = item as Record<string, unknown>;
        const id = text(record.id, 60);
        const label = text(record.label, 100);
        const description = text(record.description, 300) || null;
        const priceId = text(record.priceId, 120);
        const credits = Number(record.credits);
        const amountCents = Number(record.amountCents);
        const currency = text(record.currency, 3).toUpperCase();

        if (!/^[a-z0-9][a-z0-9_-]{1,59}$/i.test(id)) return null;
        if (label.length < 2) return null;
        if (!/^price_[a-z0-9]+$/i.test(priceId)) return null;
        if (!Number.isInteger(credits) || credits < 1 || credits > 100_000) return null;
        if (!Number.isInteger(amountCents) || amountCents < 50 || amountCents > 100_000_000) {
          return null;
        }
        if (!/^[A-Z]{3}$/.test(currency)) return null;

        return { id, label, credits, priceId, amountCents, currency, description };
      })
      .filter((pack): pack is CreditPack => Boolean(pack));

    return Array.from(new Map(packs.map((pack) => [pack.id, pack])).values());
  } catch (error) {
    console.error("Unable to parse STRIPE_CREDIT_PACKS_JSON", error);
    return [];
  }
}

export function getCreditPack(id: string) {
  return getCreditPacks().find((pack) => pack.id === id) ?? null;
}

export function publicCreditPack(pack: CreditPack) {
  return {
    id: pack.id,
    label: pack.label,
    credits: pack.credits,
    amountCents: pack.amountCents,
    currency: pack.currency,
    description: pack.description,
  };
}
