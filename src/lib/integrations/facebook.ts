export interface FbLeadField {
  name: string;
  values: string[];
}

export interface FbLeadData {
  id: string;
  field_data: FbLeadField[];
  created_time: string;
  ad_id?: string;
  ad_name?: string;
  adset_id?: string;
  adset_name?: string;
  campaign_id?: string;
  campaign_name?: string;
  form_id?: string;
  is_organic?: boolean;
  platform?: string;
}

const DEFAULT_META_GRAPH_VERSION = "v26.0";
const LEAD_FIELDS = [
  "field_data",
  "created_time",
  "ad_id",
  "ad_name",
  "adset_id",
  "adset_name",
  "campaign_id",
  "campaign_name",
  "form_id",
  "is_organic",
  "platform",
].join(",");

/**
 * Meta retires Graph versions on a rolling clock. Keep the default current but make it
 * operator-overridable so a future version bump is configuration, not an emergency patch.
 */
export function metaGraphVersion(): string {
  const configured = process.env.META_GRAPH_VERSION?.trim();
  return configured && /^v\d+\.\d+$/.test(configured) ? configured : DEFAULT_META_GRAPH_VERSION;
}

export function facebookLeadUrl(leadgenId: string): string {
  const id = encodeURIComponent(leadgenId);
  const fields = encodeURIComponent(LEAD_FIELDS);
  return `https://graph.facebook.com/${metaGraphVersion()}/${id}?fields=${fields}`;
}

export async function fetchFbLead(leadgenId: string, accessToken: string): Promise<FbLeadData> {
  const res = await fetch(facebookLeadUrl(leadgenId), {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`FB API error: ${res.status} ${res.statusText}`);
  return res.json();
}

export function extractLeadField(fieldData: FbLeadField[], fieldName: string): string | undefined {
  const field = fieldData.find((f) => f.name.toLowerCase().includes(fieldName.toLowerCase()));
  return field?.values[0];
}

export function verifyFbWebhookSignature(body: string, signature: string, secret: string): boolean {
  // Node.js crypto is available server-side
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { createHmac, timingSafeEqual } = require("crypto") as typeof import("crypto");
  const expected = Buffer.from(
    "sha256=" + createHmac("sha256", secret).update(body).digest("hex"),
    "utf8"
  );
  const received = Buffer.from(signature || "", "utf8");
  return expected.length === received.length && timingSafeEqual(expected, received);
}
