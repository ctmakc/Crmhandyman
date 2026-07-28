import type { Metadata } from "next";
import "./globals.css";
import { SessionProvider } from "@/components/SessionProvider";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://handymanpro.ca";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "HandymanPro | Contractor CRM and local services network",
    template: "%s | HandymanPro",
  },
  description:
    "Contractor CRM and public Canadian home-services network for local pros, project requests, trade jobs and verified business profiles.",
  applicationName: "HandymanPro",
  alternates: { canonical: "/directory" },
  openGraph: {
    type: "website",
    locale: "en_CA",
    siteName: "HandymanPro",
    title: "HandymanPro contractor network",
    description:
      "Find local contractors, post home-service projects and manage the work through one connected CRM platform.",
    url: siteUrl,
  },
  twitter: {
    card: "summary_large_image",
    title: "HandymanPro contractor network",
    description: "Canadian contractor directory connected to real CRM operations.",
  },
  robots: { index: true, follow: true },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-CA">
      <body className="font-sans antialiased">
        <SessionProvider>{children}</SessionProvider>
      </body>
    </html>
  );
}
