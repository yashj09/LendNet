import { resolve } from "path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    devtoolSegmentExplorer: false,
  },
  outputFileTracingRoot: resolve(process.cwd()),
};

export default nextConfig;
