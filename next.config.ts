import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Allows the dev server (HMR socket, dev-runtime bootstrap) to be reached
  // when testing from another device on the LAN via this machine's IP.
  // Dev-only: has no effect on production builds/deployments.
  allowedDevOrigins: ["192.168.100.32"],
};

export default nextConfig;
