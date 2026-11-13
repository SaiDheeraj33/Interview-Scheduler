import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Database drivers load WebAssembly / sockets at runtime; keep them out of the server bundle.
  serverExternalPackages: ["@electric-sql/pglite", "postgres"],
  poweredByHeader: false,
};

export default nextConfig;
