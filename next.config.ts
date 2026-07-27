import type { NextConfig } from "next";

// `process.env` rather than `src/config/env.ts`: this is build config, and it
// is read before (and outside of) the Zod-validated app runtime.
const isDev = process.env.NODE_ENV !== 'production';

// React's development build calls eval() for debugging features — source
// mapping, reconstructing callstacks across environments. Without this every
// client component fails to hydrate under `next dev` with "eval() is not
// supported in this environment". Production React never calls eval, so this
// is scoped to dev and the shipped policy is unchanged.
const scriptSrc = isDev
  ? "script-src 'self' 'unsafe-inline' 'unsafe-eval'"
  : "script-src 'self' 'unsafe-inline'";

const CSP = [
  "default-src 'self'",
  // Next's own RSC/hydration bootstrap scripts have no nonce wired up (yet)
  // — 'unsafe-inline' here is a deliberate, pragmatic v1 tradeoff, not an
  // oversight. Hardening to a nonce-based policy (proxy.ts + root layout)
  // is a tracked follow-up, not done in this pass.
  scriptSrc,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "connect-src 'self'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ');

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: '32mb',
    },
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'Content-Security-Policy', value: CSP },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=()',
          },
        ],
      },
    ];
  },
};

export default nextConfig;
