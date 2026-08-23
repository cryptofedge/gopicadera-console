import path from "path";
import type { NextConfig } from "next";

/**
 * Static export, for GitHub Pages.
 *
 * Pages serves files, not a Node process, so there is no server to render on.
 * Everything here is a browser app talking straight to Supabase with the anon
 * key; Row Level Security in Postgres is the only thing standing between a
 * visitor and the data, which is why no policy in schema.sql is optional.
 */
// The site lives at cryptofedge.github.io/gopicadera-console, not at a domain
// root, so every asset and link needs the repo name in front of it. Set this to
// "" when the console moves to admin.gopicadera.com — one edit, one place.
const BASE_PATH = "/gopicadera-console";

const nextConfig: NextConfig = {
  output: "export",

  basePath: BASE_PATH,
  assetPrefix: BASE_PATH,

  // Next prefixes its own asset URLs and every next/link href, but a plain
  // <img src="/logo.png"> is untouched and would resolve to the domain root.
  // Exposing the value lets those references prefix themselves rather than
  // hardcoding the repo name a second time.
  env: { NEXT_PUBLIC_BASE_PATH: BASE_PATH },

  // Emit /orders/index.html rather than /orders.html. Pages resolves a
  // directory to its index file, so this is what makes /orders work as a URL
  // a person can type or refresh on.
  trailingSlash: true,

  // No server means no image optimiser.
  images: { unoptimized: true },

  // Pinned because a stray package-lock.json in the home directory otherwise
  // makes Turbopack treat the whole user profile as the project root.
  turbopack: {
    root: path.resolve(import.meta.dirname),
  },
};

export default nextConfig;
