import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://handymanpro.ca";

  return {
    rules: [
      {
        userAgent: "*",
        allow: [
          "/",
          "/directory",
          "/contractors",
          "/pro/",
          "/workers",
          "/worker/",
          "/jobs",
          "/hire",
        ],
        disallow: [
          "/api/",
          "/app",
          "/admin",
          "/settings",
          "/leads",
          "/network",
          "/recruiting",
          "/projects",
          "/tasks",
          "/finance",
          "/login",
          "/register",
          "/expired",
        ],
      },
    ],
    sitemap: `${baseUrl}/sitemap.xml`,
    host: baseUrl,
  };
}
