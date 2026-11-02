import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  outputFileTracingRoot: process.cwd(),
  outputFileTracingIncludes:{"/api/transcribe":["./scripts/transcribe-local.py"],"/api/assets/builtin-sfx":["./public/sfx/*.wav"]},
  experimental: { proxyClientMaxBodySize: "101mb", inlineCss: process.env.NODE_ENV !== "development" },
  poweredByHeader: false,
};

export default nextConfig;
