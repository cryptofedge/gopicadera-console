import path from "path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /**
   * Pin the project root.
   *
   * Turbopack infers the root by walking up looking for a lockfile, and there
   * is a stray package-lock.json sitting in C:\Users\Fellito Rodriguez from an
   * earlier npm run. Without this it picks the home directory as the root and
   * starts watching the entire user profile.
   */
  turbopack: {
    root: path.resolve(import.meta.dirname),
  },
};

export default nextConfig;
