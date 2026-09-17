# MUHAMMAD TOURS AND TRAVELS — Executive Architecture

Status: Phase 0 (Discovery) deliverable
Scope: B2B / B2C / Corporate travel platform, flight aggregation engine, hotel/visa/package products, CRM, accounting, AI assistant

---

## A. Executive Architecture

### System context

```
                         MUHAMMAD TOURS AND TRAVELS PLATFORM
                                    │
        ┌───────────────────────────┼───────────────────────────┐
        │                           │                           │
     B2B PORTAL                 B2C WEBSITE               CORPORATE PORTAL
   (Travel Agents)               (Customers)               (Companies)
        │                           │                           │
        └───────────────────────────┼───────────────────────────┘
                                    │
                       ┌────────────┴────────────┐
                       │      API GATEWAY /       │
                       │   BFF (per-portal auth)  │
                       └────────────┬────────────┘
                                    │
        ┌───────────────────────────┼───────────────────────────┐
        │                           │                           │
  SEARCH & BOOKING            COMMERCIAL DOMAIN            PRODUCT DOMAIN
  ───────────────             ────────────────             ─────────────
  Search Orchestrator         Wallet & Ledger              Hotel Service
  Supplier Adapters           Pricing Engine                Visa Service
  Normalization/Dedup         CRM                          Package Engine
  Booking State Machine       Notifications
  Payment Core                Documents (PDF)
                                    │
                       ┌────────────┴────────────┐
                       │   SUPPLIER INTEGRATION   │
                       │        LAYER             │
                       └────────────┬────────────┘
                                    │
        ┌──────────┬──────────┬────┴─────┬──────────┬──────────┐
      B2B S1      B2B S2     B2B S3    B2B S4/S5   Amadeus    Hotel/
    (adapter)   (adapter)  (adapter)  (adapters)  GDS/NDC   Visa APIs
```

Everything above the Supplier Integration Layer talks to a single internal
contract (`SupplierAdapter`, `HotelSupplierAdapter`, `VisaProviderAdapter`).
Nothing above that line knows or cares how many real suppliers exist, which
ones are live vs. mocked, or which protocol a given supplier speaks
(REST, SOAP, GDS EDIFACT-style, NDC XML/JSON). This is the single most
important architectural boundary in the system — see
`SUPPLIER-INTEGRATION.md`.

### Core product principle: ONE SEARCH

A single customer/agent search fans out in parallel to every authorized,
enabled supplier, tolerates partial failure, and returns one normalized,
deduplicated, priced, ranked result set. The frontend never sees supplier
count, supplier identity conflicts, or raw supplier payloads.

### Architectural principles (non-negotiable)

1. **Adapter isolation** — adding Supplier 6 means writing one adapter
   class and registering it. It never touches the orchestrator, pricing
   engine, or booking state machine.
2. **Provider isolation for payments/notifications** — same pattern:
   `PaymentProvider`, `NotificationChannel` interfaces. Swapping or adding
   a gateway/channel does not touch checkout or event logic.
3. **Ledger, not balances** — money is never mutated in place; see
   `DATABASE.md`.
4. **Mock-first** — every external dependency (supplier, payment gateway,
   SMS/WhatsApp, hotel/visa provider) has a mock implementation of the
   same interface, clearly labeled, so the platform is fully demonstrable
   with zero real credentials.
5. **Portal separation** — B2C, B2B, Corporate, and Admin are separate
   frontend applications with separate auth contexts and separate
   permission sets. They share a component/design-system package, not a
   runtime.
6. **Everything auditable** — pricing changes, wallet adjustments,
   refunds, ticketing actions, permission changes, and supplier config
   changes are all written to an immutable audit log.

---

## B. Technology Stack

| Layer | Choice | Why |
|---|---|---|
| Web frontend | Next.js 14+ / React / TypeScript | SSR for SEO on the public B2C site, file-based routing per portal, strong ecosystem, one language across the stack |
| Styling | Tailwind CSS + accessible component library | Fast iteration, consistent design tokens across four separate frontend apps |
| Backend | NestJS / TypeScript | Opinionated modular structure maps directly onto our domain modules (flights, booking, pricing, wallet, CRM…), first-class DI which is essential for the adapter pattern, built-in support for guards/interceptors (RBAC, audit logging, request correlation) |
| Database | PostgreSQL | Strong relational integrity for financial ledger and booking data, JSONB for supplier-specific raw payloads, mature migration tooling, row-level constraints for correctness |
| Cache | Redis | Search result caching, session/rate-limit state, distributed locks for repricing |
| Queue | BullMQ (Redis-backed) | Async ticketing, document generation, notification dispatch, supplier retries — all things that must not block the request/response cycle |
| Object storage | S3-compatible | Passport scans, visa documents, generated PDFs, with lifecycle/retention policies |
| Mobile | React Native / Expo | Single codebase for iOS/Android, shares TypeScript types with backend via the `packages/types` package |
| Infra | Docker + Nginx | Reproducible environments, dev/staging/prod parity, reverse proxy + TLS termination |
| API style | REST + OpenAPI | Widest client compatibility (web, mobile, future B2B API access for agents' own systems), machine-readable contract for codegen |
| Realtime | WebSocket (booking/ticketing status only) | Live status updates during the payment→booking→ticketing window, where polling would add latency users notice |
| Observability | Structured JSON logs, correlation IDs, health checks, metrics | Required to debug a multi-supplier parallel-call system in production |

Nothing here is exotic. The bias throughout is toward boring, well-understood
technology, because the hard problems in this system are domain problems
(fare rules, ledger correctness, supplier failure handling), not tooling
problems.

---

## C. Monorepo Structure

```
mohammad-travels/
├── apps/
│   ├── web/              # Next.js — public site + B2C portal
│   ├── b2b/               # Next.js — B2B agent portal
│   ├── corporate/         # Next.js — corporate portal
│   ├── admin/              # Next.js — admin control center
│   ├── api/                # NestJS — the platform API
│   └── mobile/              # React Native / Expo
│
├── packages/
│   ├── ui/                  # Shared component library (Tailwind-based)
│   ├── types/                 # Shared TypeScript types/DTOs (generated from OpenAPI where possible)
│   ├── config/                  # Shared eslint/tsconfig/tailwind config
│   ├── supplier-core/              # SupplierAdapter interface + capability matrix + registry
│   ├── flight-engine/                # Orchestrator, normalizer, dedup, ranking
│   ├── pricing-engine/                 # Markup/fee/discount rule evaluation
│   ├── booking-engine/                   # Booking state machine + transition logging
│   ├── payment-core/                       # PaymentProvider interface + mock/real gateways
│   └── notification-core/                    # NotificationChannel interface (email/SMS/WhatsApp/push) + templates
│
├── database/
│   ├── migrations/
│   └── seeds/
│
├── infra/
│   ├── docker/               # Dockerfiles per app
│   └── nginx/                  # reverse proxy config per environment
│
├── docs/
│   ├── architecture/
│   ├── api/
│   ├── database/
│   ├── deployment/
│   └── security/
│
└── tests/
    ├── unit/
    ├── integration/
    └── e2e/
```

Rationale: `packages/*-engine` and `packages/*-core` are pure, framework-
agnostic TypeScript libraries with no dependency on NestJS or Next.js. This
is deliberate — the flight engine, pricing engine, and supplier adapters
should be testable in isolation and, eventually, reusable if a piece of the
system is ever split into its own service.

---

## D. Frontend Architecture (page maps)

**Public website / B2C portal** (`apps/web`)
Home → Search → Results → Filters → Flight Details → Reprice → Passengers
→ Add-ons → Payment → Booking Confirmation → PNR/E-ticket → Manage Booking
(refund/cancel/reissue requests) → Account (history, saved travelers).

**B2B portal** (`apps/b2b`)
Register → Profile/Document Review status → Dashboard (sales, pending
bookings, ticketing queue) → Search/Book/Ticket → Wallet & Credit →
Commission & Markup view → Invoices & Statements → Customer management →
Reports.

**Corporate portal** (`apps/corporate`)
Employee: Search → Select → Policy-check result → Submit for approval →
Track status → My Trips.
Approver/Travel Manager: Approval queue → Policy configuration → Cost
center/budget view → Department & employee management → Corporate
invoices.

**Admin control center** (`apps/admin`)
Dashboard → Flight Search/Offers monitor → Bookings/PNRs/Tickets →
Refunds/Reissues queue → B2B Agents (approval, wallet adjustments) → B2C
Customers → Corporate accounts → Suppliers (config, health) → Airlines/
Airports data → Pricing & Markup rules → Commission → Accounting →
Payments → Hotels/Visa/Packages management → CRM → Notifications → AI
assistant config → Reports/BI → Users/Roles/Permissions → Security & audit
logs → System settings.

Each app has its own auth context and only requests the permission scopes
it needs — see `SECURITY.md` for the permission matrix. No shared session
token format is reused across portals with different privilege levels.

---

## L. Mobile Architecture

`apps/mobile` (React Native/Expo), consuming the same API as the B2C
portal:

Splash → Onboarding → Login/Register → Home → Flight Search → Results →
Filters → Flight Details → Passenger Details → Payment → Confirmation →
My Trips → PNR → Tickets → Refund/Reissue request → Hotels → Visa →
Packages → Notifications → Profile → AI Assistant.

Navigation: a root stack for auth, a bottom-tab navigator for
Home/Trips/AI/Profile once authenticated, with nested stacks per flow
(search→booking is its own stack so back-navigation behaves correctly
mid-checkout).

---

## Cross-references

- Database design: `DATABASE.md`
- API surface: `API.md`
- Supplier adapters, search pipeline, pricing, booking state machine:
  `SUPPLIER-INTEGRATION.md`
- AuthN/AuthZ, permission matrix, secrets, data protection: `SECURITY.md`
- Phased delivery plan, deployment pipeline, risk register: `ROADMAP.md`
