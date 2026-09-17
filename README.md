# MOHAMMAD TRAVELS — Production Travel Platform

A production-oriented monorepo for a Bangladesh travel agency evolving into a
B2B/B2C/Corporate travel technology platform.

The repository contains separate experiences for:

- **B2C:** customer flight/hotel search, booking, manage booking, visas,
  Hajj/Umrah packages and manpower services.
- **B2B:** agency registration/approval, wallet/ledger, flight/hotel search,
  booking and agency workflows.
- **Corporate:** employee booking, cost centers, travel policies and approval
  workflows.
- **Admin:** operations, agencies, corporates, suppliers, pricing, wallets,
  RBAC, audit, analytics, security, Hajj/Umrah and manpower.
- **API:** NestJS + Prisma + PostgreSQL + Redis, with supplier adapters,
  repricing, booking state transitions, payments, notifications, audit and
  rate limiting.
- **Mobile:** React Native/Expo B2C application.

## Architecture

```text
MOHAMMAD TRAVELS
        |
  +-----+------------------+
  |        |               |
 B2C      B2B          CORPORATE
  |        |               |
  +--------+---------------+
           |
      CENTRAL API
           |
  +--------+-------------------------------+
  | Flights | Hotels | Visa | Packages     |
  | Hajj/Umrah | Manpower | Payments       |
  | Wallet/Ledger | Pricing | Policy       |
  | Notifications | AI | Analytics | Audit |
  +----------------+------------------------+
                   |
          PostgreSQL + Redis
                   |
       Supplier / GDS / NDC adapters
```

The supplier layer is adapter-based. Mock suppliers remain available for
acceptance testing; real credentials are optional and explicitly enabled.
The platform never treats mock data as a real airline booking unless a real
supplier is configured.

## Important production behavior

- Idempotency is required for booking/payment operations where supported.
- Flight booking performs a mandatory supplier reprice immediately before
  booking.
- B2B booking checks agency approval and wallet/credit availability before
  settlement.
- Corporate bookings evaluate hard/soft travel policy rules and route soft
  violations to approval.
- Booking ownership and RBAC are enforced server-side; frontend visibility
  is not an authorization boundary.
- Audit records, correlation IDs, health checks, rate limiting and security
  headers are enabled in the API.
- PostgreSQL and Redis are private in the production Docker network.
- Production browser API URLs are compiled into the Next.js build, so
  `PUBLIC_API_URL` must be correct at build time.

## Local development

Requirements: Node.js 20+, Docker Desktop and Docker Compose.

```bash
npm install
cp .env.example .env
npm run db:migrate
npm run db:seed
npm run typecheck
npm run test
```

Start services in separate terminals:

```bash
npm run dev:api
npm run dev:web
npm run dev:b2b
npm run dev:corporate
npm run dev:admin
```

Local ports:

| Service | URL |
|---|---|
| B2C | http://localhost:3000 |
| B2B | http://localhost:3001 |
| Corporate | http://localhost:3002 |
| Admin | http://localhost:3003 |
| API health | http://localhost:4000/api/v1/health |

## Demo accounts

See [`docs/DEMO-ACCOUNTS.md`](docs/DEMO-ACCOUNTS.md) for the complete set.
Demo accounts are created only by the explicit demo seed command.

## Hostinger VPS

The recommended production path is Docker + Caddy on a Hostinger VPS:

```bash
cp .env.production.example .env.production
node scripts/deploy-check.mjs
npm run deploy:prod
npm run deploy:migrate
npm run deploy:seed
```

Full DNS, TLS, backup and update instructions are in
[`docs/HOSTINGER.md`](docs/HOSTINGER.md).

## Verification status

The source package was reviewed and the production deployment structure was
hardened in this release. This sandbox cannot complete a real `npm install`
because package registry access is unavailable, so a full dependency-backed
TypeScript/Jest/Docker build was **not** honestly claimed as executed here.
Run the following on the Hostinger VPS or CI runner before the first public
launch:

```bash
npm install
npm run typecheck
npm test
npm run build
node scripts/deploy-check.mjs
```

Treat any failing command as a release blocker.

## Scope honesty

A travel technology platform is not production merely because its pages load.
Live airline/GDS/NDC credentials, payment contracts, supplier commercial
rules, PCI/privacy controls, monitoring, backups, reconciliation, load tests,
incident procedures and business acceptance testing must be completed before
selling real inventory through the platform.


## Phase 5 release

The B2C web experience has been upgraded to a production-oriented multi-route travel site with:
- real page navigation,
- Singapore-Airlines-style flight-search interaction patterns,
- strict API-backed airport selection,
- dynamic one-way/round-trip date controls,
- separate passenger and cabin controls,
- improved hotel search UX,
- hardened customer login/registration with web-side 2FA challenge handling,
- browser security headers,
- sitemap/robots metadata,
- web/API health checks,
- production deployment validation,
- Docker readiness checks,
- and GitHub Actions quality gates.

See `docs/PHASE-5-RELEASE.md` for the release audit and the exact boundary between verified code and live credentials/integrations that still require operational testing.
