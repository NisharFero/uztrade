import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  outputFileTracingIncludes: {
    "/*": ["./public/data/procedures/**/*.json"],
  },
};

export default nextConfig;
