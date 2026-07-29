import "server-only";

import {
  haversineDistanceKm,
  marketCentroid,
  matchesPostalCoverage,
  type Coordinates,
} from "@/lib/geo";
import { getPublicContractors, type PublicContractor } from "@/lib/marketplace";

export type NearbyContractorMatch = {
  contractor: PublicContractor;
  distanceKm: number | null;
  matchReason: "DISTANCE" | "POSTAL" | "CITY";
};

function normalized(value: string | null | undefined) {
  return (value ?? "").trim().toLowerCase();
}

function contractorCoordinates(contractor: PublicContractor): Coordinates | null {
  if (contractor.latitude != null && contractor.longitude != null) {
    return { latitude: contractor.latitude, longitude: contractor.longitude };
  }
  const centroid = marketCentroid(contractor.city, contractor.province);
  return centroid
    ? { latitude: centroid.latitude, longitude: centroid.longitude }
    : null;
}

export async function findNearbyContractors(input: {
  coordinates?: Coordinates | null;
  postalCode?: string;
  city?: string;
  province?: string;
  service?: string;
  radiusKm?: number;
  limit?: number;
}) {
  const contractors = await getPublicContractors({
    service: input.service,
    limit: 250,
  });
  const radiusKm = Math.min(Math.max(input.radiusKm ?? 50, 1), 250);
  const requestedCity = normalized(input.city);
  const requestedProvince = normalized(input.province);
  const matches: NearbyContractorMatch[] = [];

  for (const contractor of contractors) {
    const coordinates = contractorCoordinates(contractor);
    if (input.coordinates && coordinates) {
      const distanceKm = haversineDistanceKm(input.coordinates, coordinates);
      const effectiveRadius = Math.max(radiusKm, contractor.serviceRadiusKm);
      if (distanceKm <= effectiveRadius) {
        matches.push({ contractor, distanceKm, matchReason: "DISTANCE" });
        continue;
      }
    }

    if (
      input.postalCode &&
      matchesPostalCoverage(
        input.postalCode,
        contractor.postalCode,
        contractor.serviceAreas.map((area) => area.postalPrefix)
      )
    ) {
      matches.push({ contractor, distanceKm: null, matchReason: "POSTAL" });
      continue;
    }

    const matchesCity =
      requestedCity &&
      (normalized(contractor.city) === requestedCity ||
        contractor.serviceAreas.some((area) => normalized(area.city) === requestedCity));
    const matchesProvince =
      !requestedProvince ||
      normalized(contractor.province) === requestedProvince ||
      contractor.serviceAreas.some((area) => normalized(area.province) === requestedProvince);
    if (matchesCity && matchesProvince) {
      matches.push({ contractor, distanceKm: null, matchReason: "CITY" });
    }
  }

  return matches
    .sort((a, b) => {
      if (a.distanceKm != null && b.distanceKm != null) return a.distanceKm - b.distanceKm;
      if (a.distanceKm != null) return -1;
      if (b.distanceKm != null) return 1;
      if (a.contractor.averageRating !== b.contractor.averageRating) {
        return b.contractor.averageRating - a.contractor.averageRating;
      }
      return b.contractor.reviewCount - a.contractor.reviewCount;
    })
    .slice(0, Math.min(Math.max(input.limit ?? 100, 1), 100));
}
