// Force Next.js server restart to load new Prisma client
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  allowedDevOrigins: ["192.168.0.100"],
  transpilePackages: ["geist"]
};

export default nextConfig;
