import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    root: process.cwd(),
  },

  serverExternalPackages: ["@wppconnect-team/wppconnect", "puppeteer", "puppeteer-core", "pg", "bcryptjs", "sharp"],
  output: process.env.DOCKER_BUILD === "true" ? "standalone" : undefined,


  experimental: {

    serverActions: {
      bodySizeLimit: "64mb",
      allowedOrigins: ["192.168.137.150"]
    }
  },
  allowedDevOrigins: ["192.168.137.150"],

};
export default nextConfig;
