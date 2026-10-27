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

const uploadMaxMb = (() => {
  const value = Number(process.env.PROJECTOR_UPLOAD_MAX_MB ?? "25");
  return Number.isFinite(value) && value > 0 ? value : 25;
})();

const nextConfig: NextConfig = {
  reactStrictMode: true,
  experimental: {
    // Le proxy (middleware) met le corps des requêtes en tampon : il doit accepter
    // les documents annexes jusqu'à la taille maximale configurée (+ marge multipart).
    proxyClientMaxBodySize: `${Math.ceil(uploadMaxMb) + 5}mb`,
  },
  // Évite les conflits si .next/ a été créé par root (Permission denied / Turbopack panic).
  distDir: process.env.NEXT_DIST_DIR ?? ".local/next",
  // Onglets Teams : seul Microsoft Teams / Microsoft 365 peut afficher PROJECTOR dans un cadre.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          {
            key: "Content-Security-Policy",
            value:
              "frame-ancestors 'self' https://teams.microsoft.com https://*.teams.microsoft.com https://*.teams.cloud.microsoft https://*.cloud.microsoft https://*.office.com https://*.microsoft365.com https://*.skype.com",
          },
        ],
      },
    ];
  },
  allowedDevOrigins: [
    "172.16.12.10",
    "localhost",
    "127.0.0.1",
    publicHostname,
  ],
};

export default nextConfig;
