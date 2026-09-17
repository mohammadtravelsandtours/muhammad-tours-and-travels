# MOHAMMAD TRAVELS — Release hardening summary

## Preserved functionality

The release keeps the existing B2C, B2B, Corporate, Admin, API and Mobile
surfaces and their existing flight, hotel, booking, wallet, pricing, visa,
Hajj/Umrah, manpower, policy, notification, AI, analytics, audit and RBAC
modules. No existing module was intentionally removed.

## Engineering improvements

- Added a dedicated Hostinger/VPS production Compose stack.
- Added Caddy reverse proxy with automatic HTTPS for all application domains.
- Removed public exposure of PostgreSQL and Redis from the production stack.
- Added production healthchecks for API and Next.js containers.
- Fixed production Next.js API configuration by making `NEXT_PUBLIC_API_URL`
  an explicit build argument.
- Added production environment template and deployment validation.
- Added deployment, migration and seed commands.
- Added complete staging/demo role coverage: admin, operations, finance, B2B
  agency admin, B2B agent, B2C customer, corporate employee and corporate
  approver.
- Added a separate demo-account document and kept demo seeding explicit.
- Made the AI model and tool-loop limits configurable rather than permanently
  hard-coded.
- Enabled one-hop proxy trust in production so client IP based throttling and
  request logging work correctly behind Caddy/Nginx.
- Updated customer-facing office/contact information with the supplied
  Bangladesh and Singapore contact numbers.
- Rewrote the README to reflect the actual current platform instead of an
  outdated Phase-1-only description.

## Verification limitation

This environment could not complete `npm install` because registry access did
not finish within the available execution window. Therefore this release does
not falsely claim a full dependency-backed build/test run. The package JSON
files, production environment references, deployment-check script and other
static release checks were executed successfully.

Before the first production launch, CI/VPS must run:

```bash
npm install
npm run typecheck
npm test
npm run build
node scripts/deploy-check.mjs
```
