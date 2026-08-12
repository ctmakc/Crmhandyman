/** @type {import('next').NextConfig} */
const nextConfig = {
  // The container ships .next/standalone and starts it with `node server.js`.
  // `next start` cannot serve this output — see DEPLOY.md before changing it.
  output: "standalone",
  // Native addon: it must stay a runtime require instead of being bundled.
  experimental: {
    serverComponentsExternalPackages: ["better-sqlite3"],
  },
  // The version banner is free reconnaissance for anyone scanning the host.
  poweredByHeader: false,
};

export default nextConfig;
