import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // pdf-parse (parser letture E-distribuzione, lib/actions/letture.ts) usa
  // pdfjs-dist + @napi-rs/canvas (binario nativo): vanno esclusi dal
  // bundling webpack/turbopack lato server, altrimenti falliscono in modo
  // silenzioso sulle funzioni serverless di Vercel.
  serverExternalPackages: ["pdf-parse", "@napi-rs/canvas", "pdfjs-dist"],
};

export default nextConfig;
