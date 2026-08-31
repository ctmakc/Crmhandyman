export interface LeadAttribution {
  platform?: string;
  campaignId?: string;
  campaignName?: string;
  adsetId?: string;
  adsetName?: string;
  adId?: string;
  adName?: string;
  formId?: string;
  formName?: string;
  isOrganic?: boolean;
  createdTime?: string;
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  utmContent?: string;
  utmTerm?: string;
  landingPage?: string;
  referrer?: string;
  fbclid?: string;
  gclid?: string;
}

const STRING_LIMITS: Record<Exclude<keyof LeadAttribution, "isOrganic">, number> = {
  platform: 40,
  campaignId: 120,
  campaignName: 240,
  adsetId: 120,
  adsetName: 240,
  adId: 120,
  adName: 240,
  formId: 120,
  formName: 240,
  createdTime: 80,
  utmSource: 160,
  utmMedium: 160,
  utmCampaign: 240,
  utmContent: 240,
  utmTerm: 240,
  landingPage: 800,
  referrer: 800,
  fbclid: 500,
  gclid: 500,
};

function clean(value: unknown, max: number): string | undefined {
  if (typeof value !== "string") return undefined;
  // Attribution can be copied into reports and CSV later; keep it single-line and bounded.
  // eslint-disable-next-line no-control-regex
  const text = value.replace(/[\x00-\x1F\x7F]/g, " ").replace(/\s+/g, " ").trim();
  return text ? text.slice(0, max) : undefined;
}

export function compactLeadAttribution(input: LeadAttribution): LeadAttribution | undefined {
  const out: LeadAttribution = {};
  for (const [key, max] of Object.entries(STRING_LIMITS) as Array<
    [Exclude<keyof LeadAttribution, "isOrganic">, number]
  >) {
    const value = clean(input[key], max);
    if (value) out[key] = value;
  }
  if (typeof input.isOrganic === "boolean") out.isOrganic = input.isOrganic;
  return Object.keys(out).length ? out : undefined;
}

export function encodeLeadAttribution(input: LeadAttribution | undefined): string | undefined {
  const compact = input ? compactLeadAttribution(input) : undefined;
  return compact ? JSON.stringify(compact) : undefined;
}

export function decodeLeadAttribution(raw: string | null | undefined): LeadAttribution | undefined {
  if (!raw) return undefined;
  try {
    const value = JSON.parse(raw) as unknown;
    if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
    return compactLeadAttribution(value as LeadAttribution);
  } catch {
    // A bad legacy/manual value must never make the lead card crash.
    return undefined;
  }
}

function scalar(raw: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = clean(raw[key], 800);
    if (value) return value;
  }
  return undefined;
}

/** Structured marketing facts from a contractor-owned form payload. */
export function intakeLeadAttribution(
  body: Record<string, unknown>,
  requestReferrer?: string | null
): LeadAttribution | undefined {
  return compactLeadAttribution({
    platform: "website",
    utmSource: scalar(body, ["utm_source", "utmSource"]),
    utmMedium: scalar(body, ["utm_medium", "utmMedium"]),
    utmCampaign: scalar(body, ["utm_campaign", "utmCampaign"]),
    utmContent: scalar(body, ["utm_content", "utmContent"]),
    utmTerm: scalar(body, ["utm_term", "utmTerm"]),
    landingPage: scalar(body, ["event_source_url", "page", "landing_page", "landingPage"]),
    referrer: scalar(body, ["referrer_url", "referrer"]) ?? clean(requestReferrer, 800),
    fbclid: scalar(body, ["fbclid"]),
    gclid: scalar(body, ["gclid"]),
  });
}

export interface MetaLeadAttributionInput {
  platform?: string;
  campaign_id?: string;
  campaign_name?: string;
  adset_id?: string;
  adset_name?: string;
  ad_id?: string;
  ad_name?: string;
  form_id?: string;
  form_name?: string;
  is_organic?: boolean;
  created_time?: string;
}

export function metaLeadAttribution(input: MetaLeadAttributionInput): LeadAttribution | undefined {
  return compactLeadAttribution({
    platform: input.platform || "facebook",
    campaignId: input.campaign_id,
    campaignName: input.campaign_name,
    adsetId: input.adset_id,
    adsetName: input.adset_name,
    adId: input.ad_id,
    adName: input.ad_name,
    formId: input.form_id,
    formName: input.form_name,
    isOrganic: input.is_organic,
    createdTime: input.created_time,
  });
}

/** Rows in the order an owner reads them: campaign first, click detail last. */
export function leadAttributionRows(meta: LeadAttribution | undefined): Array<{ label: string; value: string }> {
  if (!meta) return [];
  const rows: Array<{ label: string; value: string | undefined }> = [
    { label: "Campaign", value: meta.campaignName || meta.utmCampaign },
    { label: "Campaign ID", value: meta.campaignId },
    { label: "Ad set", value: meta.adsetName },
    { label: "Ad set ID", value: meta.adsetId },
    { label: "Ad", value: meta.adName },
    { label: "Ad ID", value: meta.adId },
    { label: "Form", value: meta.formName },
    { label: "Form ID", value: meta.formId },
    { label: "UTM source", value: meta.utmSource },
    { label: "UTM medium", value: meta.utmMedium },
    { label: "UTM content", value: meta.utmContent },
    { label: "UTM term", value: meta.utmTerm },
    { label: "Landing page", value: meta.landingPage },
    { label: "Referrer", value: meta.referrer },
    { label: "Meta click", value: meta.fbclid },
    { label: "Google click", value: meta.gclid },
    { label: "Platform", value: meta.platform },
    { label: "Organic", value: meta.isOrganic === undefined ? undefined : meta.isOrganic ? "Yes" : "No" },
  ];
  return rows.filter((row): row is { label: string; value: string } => Boolean(row.value));
}
