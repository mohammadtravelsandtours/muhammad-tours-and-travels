# MUHAMMAD TOURS AND TRAVELS — Phase 5 Production Release

## Scope completed in this release

### Phase 1 — Customer website
- Reworked the B2C homepage into a professional responsive travel-business layout.
- Primary navigation now uses real Next.js routes.
- Mobile navigation added.
- Internal static `<a>` links were converted to Next.js `Link` where appropriate.
- Added canonical sitemap and robots metadata.
- Added a web health endpoint at `/api/health`.
- Added baseline browser security headers in `apps/web/next.config.js`.

### Phase 2 — Flight search
- Round Trip, One Way and Multi-city modes.
- One Way renders only the departure date.
- Round Trip renders departure + return dates.
- Return date is constrained to the departure date.
- Passenger selector is a separate control.
- Travel class is a separate control.
- Adults, children and infants are independently selectable.
- Airport search is API-backed and selection-driven.
- Arbitrary airport text is no longer accepted by the browser form as a valid selection.
- Backend still remains the authoritative validation boundary.
- Existing supplier aggregation, normalization and price-revalidation architecture is preserved.

### Phase 3 — Booking
- Existing idempotency-key booking flow retained.
- Existing mandatory supplier price revalidation retained.
- Existing server-side ownership/RBAC checks retained.
- Existing supplier-confirmed PNR rule retained.
- Amadeus adapter contact-phone mapping was corrected so Bangladesh/Singapore numbers are not sent with a hard-coded North American country code.

### Phase 4 — Hotels, Hajj & Umrah, authentication
- Hotel search redesigned with destination, dates, guests/rooms and currency controls.
- Existing hotel supplier/reprice/booking APIs remain the backend source of truth.
- Existing Hajj & Umrah package catalogue/detail/booking routes remain connected.
- Customer login/register redesigned.
- Web login now handles an enabled TOTP/backup-code two-factor challenge.
- Registration has stronger client-side password guidance; server-side validation remains authoritative.

### Phase 5 — QA / deployment guardrails
- Root `typecheck` now builds `@mohammad-travels/types` before checking dependent workspaces, fixing the common `@mohammad-travels/types` dist-resolution failure.
- AuthService unit-test dependency wiring was corrected.
- Production `.env` patterns are protected by `.gitignore`.
- Production deployment check rejects the demo/manual payment provider.
- Production deployment check rejects Amadeus test endpoints.
- Production deployment check validates real Stripe/META configuration when those strategies are selected.
- Production Docker API/web health checks were added.
- GitHub Actions CI was added for install, Prisma generation, typecheck, lint, test and production build.

## Important live-integration boundary

This source tree contains a real Amadeus adapter, but it cannot be truthfully called a live-booking verification from this release alone because live supplier credentials and network access were not supplied to the build environment.

The following must be tested with the actual commercial accounts before enabling them in production:
- Amadeus production credentials and booking entitlement.
- Every contracted B2B supplier's own API/login integration and fare contract.
- Real hotel supplier credentials/API contract.
- Production payment gateway.
- Production WhatsApp Business/Meta credentials.
- Google Sheets service account and target spreadsheet.
- Production email delivery provider.

The mock supplier adapters remain intentionally available for development/test environments. They must never be represented to customers as live airline or hotel inventory.

## Required production sequence

1. Generate a package lockfile in the canonical development environment.
2. Install dependencies and run:
   - `npm run typecheck`
   - `npm run lint`
   - `npm test`
   - `npm run build`
3. Configure `.env.production` from `.env.production.example`.
4. Run:
   - `npm run deploy:check`
   - `npm run deploy:migrate`
   - `npm run deploy:prod`
5. Verify:
   - `https://<API_DOMAIN>/api/v1/health`
   - `https://<PUBLIC_DOMAIN>`
   - B2B, Corporate and Admin domains
6. Enable only suppliers that have passed live contract/API testing.
7. Never commit `.env.production`, API secrets, private keys or payment credentials.

## Current release verification

Static source audit completed in the build environment:
- 650 files inspected from the uploaded release archive.
- No private-key / Stripe-live-key / AWS-access-key patterns found in source files.
- No internal web `href="#..."` navigation remains.
- Static internal route references were checked against the Next.js page tree.
- Full dependency-based typecheck/build could not be executed in the sandbox because the uploaded release did not contain `package-lock.json` or installed dependencies, and registry access timed out. This is a verification limitation, not a claim that the build is clean.
