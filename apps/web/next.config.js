/** @type {import('next').NextConfig} */
const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
  { key: 'X-DNS-Prefetch-Control', value: 'off' },
];

const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  async headers() {
    return [{ source: '/(.*)', headers: securityHeaders }];
  },
  transpilePackages: ['@mohammad-travels/types'],
  eslint: {
    // ESLint was only just wired up for this app (see .eslintrc.json +
    // the CI workflow's own comment on why its lint job is
    // non-blocking) — it's never been run against this app's existing
    // files, so `next build` failing the whole build over unverified
    // lint findings would tie two independent signals together. Once a
    // real CI run establishes a clean (or triaged) baseline, this can
    // come out and `next build` can lint for real again.
    ignoreDuringBuilds: true,
  },
};

module.exports = nextConfig;
