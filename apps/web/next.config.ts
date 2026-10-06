import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* Every route, at any depth: /procedures/[id] and the API routes under
     /api/cases/[id]/... all load workflow files. "/*" matches one segment
     only, which left the nested routes to fall back to fetching them over
     HTTP from the deployment's own origin. */
  outputFileTracingIncludes: {
    "/**/*": ["./public/data/procedures/**/*.json"],
  },
};

export default nextConfig;
