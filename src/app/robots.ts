import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://handymanpro.ca";

  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/directory", "/contractors", "/pro/", "/jobs", "/hire"],
        disallow: [
          "/api/",
          "/admin",
          "/settings",
          "/leads",
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
