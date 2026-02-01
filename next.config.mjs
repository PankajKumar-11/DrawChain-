/** @type {import("next").NextConfig} */
const nextConfig = {
  transpilePackages: ["@rainbow-me/rainbowkit", "wagmi", "viem"],
  reactStrictMode: true,
};

export default nextConfig;