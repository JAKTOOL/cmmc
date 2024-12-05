import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "export",
  redirects: async () => {
    return [
      {
        source: "/",
        destination: "/r3",
        permanent: true
      }
    ]
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;
