/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    serverComponentsExternalPackages: ["pg"],
  },
  webpack: (config, { nextRuntime, webpack }) => {
    // Edge runtime lacks __dirname; Next 14.2.x's bundled ua-parser-js
    // (pulled in via NextRequest) references it at module-load time and
    // crashes middleware with MIDDLEWARE_INVOCATION_FAILED on Vercel.
    // Substitute a literal at compile time so the reference never hits
    // runtime. Only fires for the edge bundle; server + client chunks
    // keep Node's real __dirname.
    if (nextRuntime === "edge") {
      config.plugins.push(
        new webpack.DefinePlugin({
          __dirname: JSON.stringify("/"),
        }),
      );
    }
    return config;
  },
};

export default nextConfig;
