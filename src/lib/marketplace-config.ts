export const SERVICE_CATALOG = [
  { slug: "general-handyman", name: "General handyman", category: "General repairs" },
  { slug: "drywall-repair", name: "Drywall repair", category: "Interior" },
  { slug: "interior-painting", name: "Interior painting", category: "Painting" },
  { slug: "exterior-painting", name: "Exterior painting", category: "Painting" },
  { slug: "bathroom-renovation", name: "Bathroom renovation", category: "Renovation" },
  { slug: "kitchen-renovation", name: "Kitchen renovation", category: "Renovation" },
  { slug: "basement-finishing", name: "Basement finishing", category: "Renovation" },
  { slug: "deck-building", name: "Deck building and repair", category: "Exterior" },
  { slug: "fence-repair", name: "Fence repair", category: "Exterior" },
  { slug: "flooring-installation", name: "Flooring installation", category: "Interior" },
  { slug: "tile-installation", name: "Tile installation", category: "Interior" },
  { slug: "carpentry", name: "Carpentry", category: "Carpentry" },
] as const;

export const CANADIAN_MARKETS = [
  { province: "Ontario", provinceSlug: "ontario", city: "Ottawa", citySlug: "ottawa" },
  { province: "Ontario", provinceSlug: "ontario", city: "Kanata", citySlug: "kanata" },
  { province: "Ontario", provinceSlug: "ontario", city: "Toronto", citySlug: "toronto" },
  { province: "Ontario", provinceSlug: "ontario", city: "Mississauga", citySlug: "mississauga" },
  { province: "Ontario", provinceSlug: "ontario", city: "Hamilton", citySlug: "hamilton" },
  { province: "Quebec", provinceSlug: "quebec", city: "Montreal", citySlug: "montreal" },
  { province: "Alberta", provinceSlug: "alberta", city: "Calgary", citySlug: "calgary" },
  { province: "Alberta", provinceSlug: "alberta", city: "Edmonton", citySlug: "edmonton" },
  {
    province: "British Columbia",
    provinceSlug: "british-columbia",
    city: "Vancouver",
    citySlug: "vancouver",
  },
] as const;

export function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

export function titleFromSlug(value: string): string {
  return value
    .split(/[-_]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}
