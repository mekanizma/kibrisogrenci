const path = require('path');

const allowedOrigins = (process.env.CORS_ORIGINS || process.env.NEXT_PUBLIC_SITE_URL || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

const isProd = process.env.NODE_ENV === 'production';

const securityHeaders = [
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(self)' },
  { key: 'X-DNS-Prefetch-Control', value: 'on' },
];

// Strict CSP only in production — Next.js dev needs unsafe-eval for hydration/HMR.
if (isProd) {
  securityHeaders.push({
    key: 'Content-Security-Policy',
    value: [
      "default-src 'self'",
      "img-src 'self' data: blob: https:",
      "style-src 'self' 'unsafe-inline' https://unpkg.com https://challenges.cloudflare.com",
      "script-src 'self' 'unsafe-inline' https://challenges.cloudflare.com",
      "font-src 'self' data:",
      "frame-src https://challenges.cloudflare.com",
      "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://*.tile.openstreetmap.org https://nominatim.openstreetmap.org https://api.frankfurter.dev https://challenges.cloudflare.com",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      // Shopier PAT hosted checkout POSTs the buyer to shopier.com
      "form-action 'self' https://www.shopier.com https://shopier.com",
    ].join('; '),
  });
  securityHeaders.push({
    key: 'Strict-Transport-Security',
    value: 'max-age=63072000; includeSubDomains; preload',
  });
}

const nextConfig = {
  output: 'standalone',
  outputFileTracingRoot: path.join(__dirname),
  // Hide the Next.js DevTools badge/portal in local development.
  devIndicators: false,
  images: {
    formats: ['image/avif', 'image/webp'],
    deviceSizes: [640, 750, 828, 1080, 1200, 1600],
    imageSizes: [16, 32, 48, 64, 96, 128, 256, 384],
    minimumCacheTTL: 60 * 60 * 24 * 7,
    remotePatterns: [
      { protocol: 'https', hostname: '**.supabase.co', pathname: '/storage/v1/object/**' },
      { protocol: 'https', hostname: 'images.unsplash.com', pathname: '/**' },
      { protocol: 'https', hostname: 'images.pexels.com', pathname: '/**' },
    ],
  },
  serverExternalPackages: ['mongodb'],
  onDemandEntries: {
    maxInactiveAge: 60_000,
    pagesBufferLength: 4,
  },
  async headers() {
    const headers = [...securityHeaders];
    if (allowedOrigins.length === 1) {
      headers.push({ key: 'Access-Control-Allow-Origin', value: allowedOrigins[0] });
      headers.push({ key: 'Access-Control-Allow-Credentials', value: 'true' });
    }
    return [{ source: '/(.*)', headers }];
  },
};

module.exports = nextConfig;
