/** @type {import("next").NextConfig} */
const nextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: "2mb"
    }
  },
  webpack(config, { dev }) {
    if (dev) {
      const existingIgnored = Array.isArray(config.watchOptions?.ignored)
        ? config.watchOptions.ignored
        : config.watchOptions?.ignored
          ? [config.watchOptions.ignored]
          : [];

      config.watchOptions = {
        ...config.watchOptions,
        ignored: [
          ...existingIgnored.filter(
            (pattern) => typeof pattern === "string" && pattern.length > 0
          ),
          "**/public/uploads/**",
          "**/public/reference_library/**",
          "**/public/reference-thumbs/**",
          "**/reference_library/raw/**",
          "**/reference_library/normalized/**",
          "**/reference_zips/**",
          "**/debug_bundle/**"
        ]
      };
    }

    return config;
  }
};

export default nextConfig;
