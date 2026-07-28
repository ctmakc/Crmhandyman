export type Coordinates = {
  latitude: number;
  longitude: number;
};

export type CanadianMarketCentroid = Coordinates & {
  city: string;
  province: string;
};

const CANADIAN_MARKET_CENTROIDS: CanadianMarketCentroid[] = [
  { city: "Ottawa", province: "Ontario", latitude: 45.4215, longitude: -75.6972 },
  { city: "Kanata", province: "Ontario", latitude: 45.3088, longitude: -75.8987 },
  { city: "Toronto", province: "Ontario", latitude: 43.6532, longitude: -79.3832 },
  { city: "Mississauga", province: "Ontario", latitude: 43.589, longitude: -79.6441 },
  { city: "Hamilton", province: "Ontario", latitude: 43.2557, longitude: -79.8711 },
  { city: "Montreal", province: "Quebec", latitude: 45.5019, longitude: -73.5674 },
  { city: "Calgary", province: "Alberta", latitude: 51.0447, longitude: -114.0719 },
  { city: "Edmonton", province: "Alberta", latitude: 53.5461, longitude: -113.4938 },
  { city: "Vancouver", province: "British Columbia", latitude: 49.2827, longitude: -123.1207 },
];

function normalize(value: string | null | undefined) {
  return (value ?? "").trim().toLowerCase();
}

export function normalizeCanadianPostalCode(value: string | null | undefined) {
  return (value ?? "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 6);
}

export function canadianFsa(value: string | null | undefined) {
  const normalized = normalizeCanadianPostalCode(value);
  return normalized.length >= 3 ? normalized.slice(0, 3) : normalized;
}

export function marketCentroid(city: string | null | undefined, province: string | null | undefined) {
  const normalizedCity = normalize(city);
  const normalizedProvince = normalize(province);
  return (
    CANADIAN_MARKET_CENTROIDS.find(
      (market) =>
        normalize(market.city) === normalizedCity && normalize(market.province) === normalizedProvince
    ) ?? null
  );
}

export function haversineDistanceKm(from: Coordinates, to: Coordinates) {
  const earthRadiusKm = 6371.0088;
  const toRadians = (degrees: number) => (degrees * Math.PI) / 180;
  const deltaLatitude = toRadians(to.latitude - from.latitude);
  const deltaLongitude = toRadians(to.longitude - from.longitude);
  const latitude1 = toRadians(from.latitude);
  const latitude2 = toRadians(to.latitude);

  const a =
    Math.sin(deltaLatitude / 2) ** 2 +
    Math.cos(latitude1) * Math.cos(latitude2) * Math.sin(deltaLongitude / 2) ** 2;
  return earthRadiusKm * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function validCoordinates(latitude: unknown, longitude: unknown): Coordinates | null {
  const lat = Number(latitude);
  const lng = Number(longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return { latitude: lat, longitude: lng };
}

export function matchesPostalCoverage(
  postalCode: string | null | undefined,
  profilePostalCode: string | null | undefined,
  serviceAreaPrefixes: Array<string | null | undefined>
) {
  const requestedFsa = canadianFsa(postalCode);
  if (!requestedFsa) return false;

  const prefixes = [profilePostalCode, ...serviceAreaPrefixes]
    .map((value) => canadianFsa(value))
    .filter(Boolean);
  return prefixes.some((prefix) => requestedFsa.startsWith(prefix) || prefix.startsWith(requestedFsa));
}
