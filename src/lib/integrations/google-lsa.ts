export interface GoogleLsaLead {
  name: string;
  contactDetails?: {
    consumerName?: string;
    phoneNumber?: string;
    email?: string;
  };
  note?: string;
  leadType?: string;
  geo?: {
    postalCode?: string;
  };
}

export async function fetchGoogleLsaLeads(accessToken: string): Promise<GoogleLsaLead[]> {
  const res = await fetch(
    "https://localservices.googleapis.com/v1/leads?filter=LEAD_TYPE%3DPHONE_CALL",
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  );
  if (!res.ok) throw new Error(`Google LSA API error: ${res.statusText}`);
  const data = await res.json();
  return data.leads || [];
}
