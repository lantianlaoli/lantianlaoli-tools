import type { NextConfig } from "next";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;
const siteOrigin = siteUrl ? new URL(siteUrl).origin : undefined;
const siteHost = siteUrl ? new URL(siteUrl).host : undefined;

const nextConfig: NextConfig = {
  allowedDevOrigins: [
    "*.ngrok-free.app",
    ...(siteOrigin ? [siteOrigin] : []),
    ...(siteHost ? [siteHost] : []),
  ],
};

export default nextConfig;
