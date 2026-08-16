import { createHmac, timingSafeEqual } from "node:crypto";

export interface FbLeadField {
  name: string;
  values: string[];
}

export interface FbLeadData {
  id: string;
  field_data: FbLeadField[];
  created_time: string;
}

export async function fetchFbLead(leadgenId: string, accessToken: string): Promise<FbLeadData> {
  const url = `https://graph.facebook.com/v18.0/${leadgenId}?access_token=${accessToken}&fields=field_data,created_time`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`FB API error: ${res.statusText}`);
  return res.json();
}

export function extractLeadField(fieldData: FbLeadField[], fieldName: string): string | undefined {
  const field = fieldData.find((f) => f.name.toLowerCase().includes(fieldName.toLowerCase()));
  return field?.values[0];
}

export function verifyFbWebhookSignature(body: string, signature: string, secret: string): boolean {
  if (!secret || !signature.startsWith("sha256=")) return false;
  const providedHex = signature.slice("sha256=".length);
  if (!/^[a-f0-9]{64}$/i.test(providedHex)) return false;

  const expected = createHmac("sha256", secret).update(body).digest();
  const provided = Buffer.from(providedHex, "hex");
  return expected.length === provided.length && timingSafeEqual(expected, provided);
}
