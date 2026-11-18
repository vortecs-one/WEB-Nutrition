import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Allows the dev server (HMR socket, dev-runtime bootstrap) to be reached
  // when testing from another device on the LAN via this machine's IP.
  // Dev-only: has no effect on production builds/deployments.
  allowedDevOrigins: ["192.168.100.32"],
  experimental: {
    // Product photos for Open Food Facts go through a Server Action; the
    // Food API accepts up to 10 MB per photo (the 1 MB default is too small).
    serverActions: { bodySizeLimit: "11mb" },
  },
};

export default nextConfig;
