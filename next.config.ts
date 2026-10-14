import type { NextConfig } from "next";
const config: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  serverExternalPackages: ["@electric-sql/pglite"],
};
export default config;
