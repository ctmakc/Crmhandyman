import type { CSSProperties } from "react";
import type { Metadata } from "next";
import "@fontsource/chivo/400.css";
import "@fontsource/chivo/500.css";
import "@fontsource/chivo/700.css";
import "@fontsource/chivo/900.css";
import "@fontsource/chivo-mono/400.css";
import "@fontsource/chivo-mono/500.css";
import "@fontsource/chivo-mono/700.css";
import "./globals.css";
import { SessionProvider } from "@/components/SessionProvider";

export const metadata: Metadata = {
  title: "HandymanPro CRM",
  description: "Work-order CRM for HVAC, moving and trade contractors",
};

/**
 * One superfamily — see DESIGN.md. Chivo carries the plate-lettering voice,
 * Chivo Mono carries every number, ID and date in the product. Self-hosted via
 * Fontsource so a production build never reaches for Google Fonts.
 */
const fontVariables = {
  "--font-sans": '"Chivo"',
  "--font-mono": '"Chivo Mono"',
} as CSSProperties;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" style={fontVariables}>
      <body className="font-sans antialiased">
        <SessionProvider>{children}</SessionProvider>
      </body>
    </html>
  );
}
