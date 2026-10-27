import type { NextConfig } from "next";

// O Flight Tracker continua sendo um site estático próprio na Vercel. O hub
// o serve sob o mesmo domínio (/voos/painel), assim ele fica atrás do mesmo
// login caso um dia vire privado. Rewrites são lidos no build: depois de
// mudar FLIGHTS_URL na Vercel, é preciso um novo deploy.
const flightsUrl = process.env.FLIGHTS_URL?.replace(/\/+$/, "");

const nextConfig: NextConfig = {
  poweredByHeader: false,
  async rewrites() {
    if (!flightsUrl) return [];
    return [
      { source: "/voos/painel", destination: `${flightsUrl}/` },
      { source: "/voos/painel/:path*", destination: `${flightsUrl}/:path*` },
    ];
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "same-origin" },
          { key: "Content-Security-Policy", value: "frame-ancestors 'self'" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
};

export default nextConfig;
