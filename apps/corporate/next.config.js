/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
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
