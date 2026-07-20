import type { NextConfig } from "next";

const publicHostname = (() => {
  const raw = process.env.PROJECTOR_PUBLIC_URL;
  if (!raw) return "projector.aguilera.ch";
  try {
    return new URL(raw).hostname;
  } catch {
    return "projector.aguilera.ch";
  }
})();

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Évite les conflits si .next/ a été créé par root (Permission denied / Turbopack panic).
  distDir: process.env.NEXT_DIST_DIR ?? ".local/next",
  allowedDevOrigins: [
    "172.16.12.10",
    "localhost",
    "127.0.0.1",
    publicHostname,
  ],
};

export default nextConfig;
