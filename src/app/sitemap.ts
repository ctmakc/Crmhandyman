import type { MetadataRoute } from "next";
import { prisma } from "@/lib/prisma";
import { slugify } from "@/lib/marketplace";

export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://handymanpro.ca";
  const now = new Date();

  const staticRoutes: MetadataRoute.Sitemap = [
    { url: `${baseUrl}/directory`, lastModified: now, changeFrequency: "daily", priority: 1 },
    { url: `${baseUrl}/contractors`, lastModified: now, changeFrequency: "daily", priority: 0.9 },
    { url: `${baseUrl}/jobs`, lastModified: now, changeFrequency: "daily", priority: 0.8 },
    { url: `${baseUrl}/hire`, lastModified: now, changeFrequency: "monthly", priority: 0.7 },
  ];

  try {
    const [profiles, vacancies] = await Promise.all([
      prisma.contractorProfile.findMany({
        where: { profileStatus: "PUBLISHED" },
        include: { services: true },
        orderBy: { updatedAt: "desc" },
      }),
      prisma.vacancy.findMany({
        where: {
          status: "PUBLISHED",
          OR: [{ validThrough: null }, { validThrough: { gte: now } }],
        },
        orderBy: { updatedAt: "desc" },
      }),
    ]);

    const profileRoutes: MetadataRoute.Sitemap = profiles.map((profile) => ({
      url: `${baseUrl}/pro/${profile.slug}`,
      lastModified: profile.updatedAt,
      changeFrequency: "weekly",
      priority: 0.8,
    }));

    const geoRouteMap = new Map<string, Date>();
    for (const profile of profiles) {
      for (const service of profile.services) {
        const url = `${baseUrl}/contractors/${slugify(profile.province)}/${slugify(
          profile.city
        )}/${service.slug}`;
        const current = geoRouteMap.get(url);
        if (!current || current < profile.updatedAt) geoRouteMap.set(url, profile.updatedAt);
      }
    }

    const geoRoutes: MetadataRoute.Sitemap = Array.from(geoRouteMap.entries()).map(
      ([url, lastModified]) => ({
        url,
        lastModified,
        changeFrequency: "daily",
        priority: 0.75,
      })
    );

    const vacancyRoutes: MetadataRoute.Sitemap = vacancies.map((vacancy) => ({
      url: `${baseUrl}/jobs/${vacancy.slug}`,
      lastModified: vacancy.updatedAt,
      changeFrequency: "daily",
      priority: 0.7,
    }));

    return [...staticRoutes, ...profileRoutes, ...geoRoutes, ...vacancyRoutes];
  } catch (error) {
    console.error("Unable to build dynamic sitemap", error);
    return staticRoutes;
  }
}
