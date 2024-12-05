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
  }
};

export default nextConfig;
