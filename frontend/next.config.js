/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Wymagane przez konfigurację hostingu (CloudLinux Passenger): standalone
  // pozwala uruchomić Next.js jako samodzielny serwer Node bez potrzeby
  // instalowania pełnych node_modules na produkcji; basePath, bo aplikacja
  // jest zamontowana pod /app (backend NestJS zajmuje /api na tej samej
  // domenie); cpus:1 ogranicza równoległość builda — wielowątkowy build
  // przekracza limit procesów (LVE) na tym hostingu współdzielonym.
  output: 'standalone',
  experimental: {
    cpus: 1,
  },
  // Nagłówki bezpieczeństwa uzupełniające helmet() z backendu
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        ],
      },
    ];
  },
};

module.exports = nextConfig;