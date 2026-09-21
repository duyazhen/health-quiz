import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@health-quiz/algorithm", "@health-quiz/db"],
};

export default nextConfig;
