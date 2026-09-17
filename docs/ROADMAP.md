# MUHAMMAD TOURS AND TRAVELS — Roadmap, Deployment & Risk Register

## O. Development roadmap

Each phase ends with: tests passing, docs updated, a working demo against
mocks, and an explicit "what remains" note before moving on — no phase is
declared done just because pages render.

| Phase | Builds | Exit criteria |
|---|---|---|
| 0 — Discovery | This document set | Architecture reviewed and accepted |
| 1 — Foundation | Monorepo, DB schema + migrations, auth, RBAC, admin shell, logging, Docker, Redis, env management | Can register/login across roles; RBAC denies correctly; CI runs lint+test+build green |
| 2 — Flight engine | Search orchestrator, mock supplier adapters (2–3), normalization, dedup, pricing, reprice, fare rules, booking state machine | A mock end-to-end search→book→ticket completes and is fully logged/auditable |
| 3 — B2B | Agent registration/approval, wallet, ledger, B2B booking/ticketing, refund/reissue, reports | An agent can be onboarded, book against wallet credit, and the ledger reconciles to the cent |
| 4 — B2C | Public site, accounts, booking, payment (mock gateway), PNR/ticket, manage booking | A customer can complete a full booking and see it in "my trips" |
| 5 — Corporate | Company/employee/approval, travel policy engine, cost centers, corporate billing | A policy-violating booking is correctly blocked/escalated for approval |
| 6 — Hotel/Visa/Packages | Hotel search/booking, visa application workflow, package builder | Each product follows the same adapter/audit patterns as flights |
| 7 — Mobile | React Native app covering the B2C flow | Feature parity with web B2C for search→book→manage |
| 8 — AI/BI | AI assistant (tool-using, no invented prices/PNR/visa data), analytics dashboards | AI assistant correctly refuses to answer live-data questions it can't verify via tool call |
| 9 — Real integrations & hardening | A real (non-mock) GDS/NDC flight supplier and a real payment gateway, both disabled-by-default behind the platform's existing dual-gate pattern; security headers, global rate limiting | A real supplier/gateway can be turned on with credentials alone — no code change — and every endpoint is behind standard security headers + rate limiting |
| 10 — Launch readiness | CI/CD pipeline (build+push+deploy with manual production promotion), load testing, monitoring/alerting (Prometheus/Grafana/Alertmanager), backup/disaster-recovery scripts + runbook | A documented, reviewable path from a green PR to a monitored production deploy with a tested rollback/restore plan |

A first real (non-mock) supplier integration can be slotted into Phase 2
or later whenever credentials/documentation are actually available —
it does not block earlier phases, per the mock-first principle.

### Phase status (as of 2026-09-13)

Phases 0–2 and 4 (B2C) were built and verified in earlier passes and are
unchanged here. This update covers the work done against Phases 3, 5, 6,
7, and 8 — reported with the same "what remains" honesty the phase
discipline above calls for, not declared done just because the backend
compiles.

**Update (same day, later pass): Phases 3/5/6's frontend gaps are now
closed, and Phases 9/10 are built.** The previous pass above left three
specific "what remains" UI gaps in Phases 3/5/6; this pass closed all of
them, then built out Phase 9 (real integrations + hardening) and Phase
10 (launch readiness), which this document previously left undefined
beyond Phase 8. See the "Phase 3/5/6 frontend gap closure," "Phase 9,"
and "Phase 10" sections below for what changed and each one's own
honest "what remains."

**Update (later pass): Phase 12 (Hajj & Umrah, WhatsApp, AI chat) and
Phase 13 (brand rename, header/nav redesign, Manpower, flight
search/policy pass, homepage hero tab switcher + carousels, and a final
responsive-polish/publish-readiness pass) are built.** See their own
sections below — the last of these ("Phase 13, final pass") is the
closing verification sweep and is the current state of the build.

**Phase 3 — B2B: substantially complete on the backend, admin UI not built.**
- Done: agent registration/wallet/ledger and B2B booking/ticketing were
  already in place from Phase 2/3's original build. This pass fixed a real
  gap found while extending it — a self-registered agency starts
  `PENDING_APPROVAL` (see `AuthService.register`) but nothing enforced
  that at booking time, so a never-reviewed agency could book and spend
  from its wallet immediately. `BookingsService.createBooking` now checks
  `agency.status === 'ACTIVE'` before any funds check or supplier call
  (covered by `bookings.service.agency-gate.spec.ts`), and a new
  `AgenciesAdminModule` (`/admin/agencies`, `AGENCY_MANAGE` permission)
  gives an admin somewhere to actually flip PENDING_APPROVAL → ACTIVE.
  Booking cancellation + refund (`POST /bookings/:id/cancel`) was also
  entirely missing despite both the supplier adapter interface and the
  payment provider already having `cancelBooking`/`refundBooking`/
  `refund` methods implemented and never called — `BookingsService.performCancellation`
  is now the one shared cancel/refund path, reused by the customer-facing
  endpoint and by fixing a second latent bug: `CorporateApprovalsService`'s
  REJECTED decision used to leave the wallet debit/payment charge in
  place with no refund at all.
- What remains: agency-wide booking visibility for an agency admin
  (`booking:read:agency` is defined but not implemented — deliberately
  denied-by-default in the interim, same posture as before this pass).
  The other two gaps noted in the earlier pass — an apps/admin agency
  approval screen and an apps/b2b search+booking UI — are now built; see
  "Phase 3/5/6 frontend gap closure" below.

**Phase 5 — Corporate: backend complete, admin/employee UI not built.**
- Done: `TravelPolicyService.evaluate()` (cabin-rank + hard/soft fare cap
  checks, currency-mismatch fare checks skipped rather than compared
  incorrectly since this platform does no FX conversion — covered by
  `travel-policy.service.spec.ts`'s full decision table) is now wired into
  `BookingsService.createBooking`: a hard violation is rejected before the
  booking row or any supplier call exists; a soft violation or no
  configured policy escalates to a `CorporateApproval` exactly as before
  this pass (backward compatible for any company with no policy set up
  yet); a fully-compliant booking now auto-approves and auto-tickets
  instead of always waiting on a human. Cost centers (`CostCenter`,
  `TravelPolicy` models + `CorporateAdminModule`/`TravelPolicyModule`) are
  new — nothing previously let anyone create a Corporate account at all,
  so `CorporateAdminModule` (`/admin/corporates`, `CORPORATE_MANAGE`) adds
  admin-provisioned company/department/employee creation (a deliberate
  sales-assisted-onboarding decision, not a self-registration gap).
- What remains: department-level policy overrides (one policy per
  corporate for now, noted as a deliberate scope limit in
  `TravelPolicy`'s schema comment). The other two gaps noted in the
  earlier pass — an apps/admin corporate/policy management screen and an
  apps/corporate cost-center picker at booking time — are now built; see
  "Phase 3/5/6 frontend gap closure" below.

**Phase 6 — Hotels/Visas/Packages: backend built end-to-end with mock
suppliers, no customer-facing UI yet.**
- Hotels: `HotelsModule` follows flights' exact adapter/audit pattern —
  two mock supplier adapters (`MOCK_HOTEL_A`/`MOCK_HOTEL_B`, same
  seeded-RNG/self-describing-offer-id design as the flight adapters),
  `HotelSearchOrchestratorService`, and `HotelsService` (mandatory reprice
  before booking, wallet-or-payment settlement, cancel+refund) — deliberately
  never invents a hotel: a search only ever prices real, already-seeded
  `HotelProperty` rows for the requested city, returning zero offers for
  an unseeded city rather than a fabricated one. No markup engine for
  hotels in this pass (documented scope decision — every `HotelOffer`
  persists with `markupAmount` 0).
- Visas: `VisasModule` — a document/workflow process, not a
  supplier-adapter search, per its own schema comment — with
  `VisaStatusHistory` as its audit trail (`SUBMITTED → UNDER_REVIEW →
  (ADDITIONAL_INFO_REQUIRED ↔ UNDER_REVIEW) → APPROVED/REJECTED`, both
  terminal), self-service apply/list/view (`VISA_APPLY`) and a staff
  review queue (`VISA_MANAGE`, `/admin/visas`).
- Packages: `PackagesModule` implements the "package builder" as a thin
  wrapper bundling one already-CONFIRMED flight `Booking` and one
  already-CONFIRMED `HotelBooking` under a shared reference and combined
  total — deliberately not a third parallel supplier-orchestration
  pipeline; each underlying booking still goes through its own real
  adapter/audit/payment path first.
- Cross-cutting: `Payment`, `Refund`, and `WalletTransaction` were made
  polymorphic (nullable `bookingId` alongside a new nullable
  `hotelBookingId`) so hotels settle through the exact same
  `PaymentsService`/`WalletService` ledger as flights, per this phase's
  own exit criterion, rather than a second parallel settlement path.
- Demo data: `npm run db:seed:demo` (new, deliberately **not** chained
  into the default `db:seed` — demo login credentials should never be
  created by default in a real environment) creates an ACTIVE B2B agency
  with a funded wallet and a Corporate with a configured policy + cost
  center, since nothing else in the app creates either.
- What remains, all three products: no jest-shim spec coverage was added
  for the hotel/visa/package logic itself in this pass (the two highest
  money/access-risk decisions from this whole update — the agency ACTIVE
  gate and the travel policy engine's decision table — were prioritized
  and are covered; hotel booking settlement and the visa status-transition
  table were not). The customer-facing UI gap noted in the earlier pass
  is now built; see "Phase 3/5/6 frontend gap closure" below.

Everything above was verified with esbuild syntax checks and import-
resolution checks across the full `apps/api/src` tree and `packages/types`,
rather than a real `tsc` typecheck or `prisma migrate` — this build
environment has no installed `node_modules` and no reachable npm
registry, so the Prisma migration for this phase (`0005_phase3_5_6_...`)
is hand-written SQL, matching migration 0002's style, and has not been
run against a live database. The jest-shim suite (`50 passed, 0 failed`)
exercises the logic listed as covered above, not a full integration test
against a real database.

**Phase 7 — Mobile: a complete, real Expo/React Native/TypeScript app
(`apps/mobile`), not run.**
- Covers the full B2C flow from Phase 7's own exit criterion — search
  (one-way/round-trip/multi-city, the same passenger/cabin controls as
  web), results (sort by price/duration/stops), fare detail, a three-step
  booking flow (travelers → contact → review, with the same mandatory
  reprice-before-submit and price-confirmation retry `apps/web`'s booking
  page implements against `POST /bookings`), a confirmation/detail screen,
  My Trips, and Manage Booking (the same airline-redirect pattern as
  `apps/web`'s `/manage-booking` — this app never touches an airline PNR
  directly, by the same honest-limit design). `BookingDetailScreen` also
  adds a Cancel action against `POST /bookings/:id/cancel`, which
  `apps/web` built in Phase 3 but has never exposed in its own UI —
  included here because "manage" in "search→book→manage" should mean
  more than read-only status.
- Auth works differently from `apps/web` by design: instead of a
  redirect-on-mount to `/login?next=...`, a gated screen renders a
  `SignInRequired` prompt whose buttons open Login/Register as modals
  (`navigation/nav-ref.ts`'s global nav ref, so any nested tab/stack
  screen can reach them); on success the modal just dismisses and the
  gated screen re-renders reactively off `useAuth()` — no serializable
  "return to" route needed. Session token lives in
  `@react-native-async-storage/async-storage` (the mobile equivalent of
  `apps/web`'s `sessionStorage`).
- The API client, DTO types, formatters, and the manage-booking airline
  dataset are intentional near-duplicates of `apps/web`'s (see each
  file's header comment) rather than a new shared package — `apps/web`
  isn't published as one, and introducing that refactor mid-phase wasn't
  worth the churn.
- **Not done, honestly**: this was never `npm install`ed, `expo start`ed,
  or opened in a simulator — same "no `node_modules`, no reachable
  registry" sandbox constraint noted above for the API changes. Every
  file was verified with the same esbuild syntax check and a hand-written
  import-resolution check (now covering `apps/mobile/src`: 29 files, 0
  syntax errors; 27 files, 0 import problems, including every named
  import actually resolving to a real export) — but Metro, the native
  builds, and the Expo/React Navigation APIs' actual runtime behavior
  have not been exercised. `apps/mobile/README.md` states this plainly
  and gives the real run instructions. No push notifications, offline
  caching, or biometric login — out of scope for feature parity with the
  web B2C flow, which is what Phase 7's exit criterion asks for.

**Phase 8 — AI/BI: real tool-using assistant + an admin analytics
dashboard, both live against real data.**
- AI assistant: `AiAssistantService` was rewritten from a zero-tool
  always-refuses stub into a genuine Anthropic tool-use loop (max 4
  iterations per turn) with three tools always available — `find_airport`,
  `search_flights`, `search_hotels` — plus a fourth,
  `get_my_flight_booking_status`, offered only when the request carries a
  signed-in user. Every tool delegates to the platform's own real service
  (`AirportsService`, `FlightSearchOrchestratorService`, `HotelsService`,
  and a new `BookingsService.findMyBookingByReference` scoped to the
  caller's own actor id **at the query level**, not a post-fetch filter,
  so it cannot leak another traveler's booking) — this is what makes
  Phase 8's exit criterion true structurally rather than by prompt
  wording alone: the model can only ever report a genuine tool result
  (including an honest "not found"/zero-results), never a value it
  invented. The system prompt mandates a tool call for any live-data
  claim and forbids stating a specific price, flight, rate, or booking
  status from memory.
  - Not verified end-to-end: this sandbox has no network access to call
    the real Anthropic API, so the tool-use loop has been read through
    carefully (and passes syntax/import/DI-wiring checks —
    `AiAssistantModule` now imports `AirportsModule`/`FlightsModule`/
    `HotelsModule`/`BookingsModule`) but has not actually been exercised
    against a live model. With no `ANTHROPIC_API_KEY` configured,
    `isConfigured()` returns `false` and the endpoint degrades to a
    static "AI help isn't set up yet" message rather than erroring.
- Analytics/BI: a new `ANALYTICS_READ` permission (granted to
  `OPS_SUPPORT`/`FINANCE` by default) gates a new `AnalyticsModule`
  (`/admin/analytics` — overview, a bookings time series, revenue by
  channel, top routes, supplier health, corporate policy stats) and a new
  `apps/admin/analytics` dashboard page consuming it. Money is always
  summed **per currency**, never blindly totaled across currencies —
  same no-FX-conversion posture as `TravelPolicyService`/`PricingService`
  from Phases 3/5. No charting library (same npm constraint) — the bar
  charts are hand-rolled inline SVG/CSS, built following the `dataviz`
  skill's procedure (form → color-by-job → validated palette → mark specs
  → hover layer → accessibility pass) with this admin app's own dark
  control-room tokens used as the status-color parameter and the skill's
  own pre-validated categorical hues borrowed only for the one 3-way
  channel breakdown that needed more fixed-identity colors than the
  brand already defines.
- Both verified with the same esbuild syntax/import checks as the rest of
  `apps/api`/`apps/admin` (145 API files, 0 errors; the admin analytics
  page checked individually) — the analytics dashboard's own data has not
  been visually spot-checked against a running Postgres instance, for the
  same "no live database in this sandbox" reason noted throughout this
  document.

**Phase 3/5/6 frontend gap closure — every UI gap the previous pass
left open is now built.**
- `apps/admin`: a new `/agencies` screen (status filter chips, detail
  panel, approve/suspend calling `PATCH /admin/agencies/:id/status`) and
  a new `/corporates` screen (create-corporate, departments/cost
  centers/employees, a travel-policy upsert form matching
  `UpsertTravelPolicyDto` exactly, including the client-side
  `hardFareCapAmount >= softFareCapAmount` check mirroring the backend's).
- `apps/b2b`: a full flight search→results→offer→book→confirmation flow
  and a bookings list/detail, ported from `apps/web`'s equivalent pages
  and re-themed to this app's own tokens — an agent can now actually
  search and book from it, not just view the dashboard/wallet.
- `apps/web`: hotels (search→results→offer→2-step book→bookings
  list/cancel), visas (apply→applications list→detail with status
  history), and packages (a builder over the caller's own confirmed
  flight/hotel bookings→detail) — all three follow the exact
  reprice-before-booking / price-confirmation-retry pattern the existing
  flight booking pages already established, rather than inventing a new
  one.
- `apps/corporate`: the booking flow now fetches `GET
  /corporate/cost-centers` and lets an employee pick one (or leave it to
  their default) before booking, and a booking's detail page shows which
  cost center it was charged to. This surfaced one real backend gap,
  fixed alongside it: `BookingsService.loadBookingDetail()`'s Prisma
  query and `BookingsController.serializeBooking()` never returned a
  booking's cost center at all — `CreateBookingDto.costCenterId` was
  being stored but was then invisible to every reader, including the
  booking's own owner.
- All four apps verified the same way as the rest of this build (esbuild
  syntax check + hand-written import-resolution check): apps/admin (15
  files, 0/0), apps/b2b (20 files, 0/0), apps/web (38 files, 0/0),
  apps/corporate (19 files, 0/0) — plus a re-check of the full
  `apps/api/src` tree (145 files, 0/0) after the cost-center backend fix.
  None of these four Next.js apps have been `npm run dev`'d or opened in
  a browser, for the same sandbox constraint noted throughout this
  document — verified for syntax/import correctness, not for visual
  layout or runtime behavior.

**Phase 9 — Real integrations & hardening.**
- A real (non-mock) flight supplier: `AmadeusFlightSupplierAdapter`
  (`apps/api/src/modules/suppliers/adapters/real`) implements
  `FlightSupplierAdapter` against Amadeus for Developers' Self-Service
  REST APIs (OAuth2 client-credentials, Flight Offers Search/Price,
  Create Orders, Order Management) via Node's native `fetch` — no new
  HTTP client or vendor SDK dependency, since Amadeus's REST contract is
  stable enough not to need one. Raw offers are cached in Redis
  (25-minute TTL, matching this platform's own search-result TTL
  convention) keyed by the adapter's own offer id, because Amadeus's
  real API requires the full raw offer object back for repricing/booking,
  not just an opaque id — an honest "not still available" is returned on
  a cache miss, the same posture this platform already takes toward an
  expired mock search. Registered in `SuppliersModule` alongside the 5
  mocks (so it's visible to admin health/analytics tooling) but seeded
  `active: false` in `database/seeds/data/suppliers.ts` — SupplierRegistry's
  pre-existing dual gate (registered in code AND active in the database)
  means this supplier is never actually called until an admin
  deliberately flips it on, by which point `AMADEUS_API_KEY`/
  `AMADEUS_API_SECRET` must also be set or every call fails closed with a
  clear "not configured" rather than a crash. `issueTicket`/
  `cancelBooking`'s ticket-void path/`refundBooking` are deliberately not
  implemented (Amadeus's self-service tier doesn't expose all of these
  programmatically) — the interface already marks these optional for
  exactly this reason.
- A real payment gateway: `StripePaymentProvider`
  (`apps/api/src/modules/payments/providers`) calls Stripe's REST
  PaymentIntents/Refunds API directly via `fetch` (same no-new-dependency
  reasoning as Amadeus). `PaymentsModule` now constructs both
  `ManualPaymentProvider` and `StripePaymentProvider` but binds
  `PAYMENT_PROVIDER` to Stripe only when `PAYMENT_PROVIDER_STRATEGY=STRIPE`
  **and** `STRIPE_SECRET_KEY` is actually set — requesting Stripe without
  credentials falls back to the mock provider with a boot warning instead
  of booting into a payment path that can only ever fail, the same
  dual-gate spirit as the supplier registry. `ChargeRequest` gained an
  optional `paymentMethodToken` (a Stripe-issued token from Stripe's own
  hosted fields — this backend still never sees a raw card number);
  `BookingsService`'s existing callers don't collect one yet, so a real
  Stripe charge attempted without a frontend that collects a payment
  method will cleanly fail with a stated reason rather than silently
  succeeding or guessing a stored card.
- Hardening: `helmet` for standard security headers (main.ts), and
  `@nestjs/throttler` (already a listed dependency, never wired in
  before this pass — a genuine pre-existing gap, not new scope) as a
  global `APP_GUARD`, config-driven via `RATE_LIMIT_TTL_SECONDS`/
  `RATE_LIMIT_MAX_REQUESTS` (default 60s/120 requests), with
  `HealthController` exempted via `@SkipThrottle()` so an orchestrator's
  liveness probe can never itself trip the limiter.
- What remains: none of this was exercised against a live Amadeus
  account or live Stripe account — this sandbox has no network access to
  either (see every file's own doc comment). Both are written strictly
  to their documented REST contracts and this platform's own existing
  interfaces, verified with esbuild/import checks and the full jest-shim
  suite (still 50 passed, 0 failed — none of the 50 existing specs touch
  `PaymentsService`/`SuppliersModule` directly, so the new constructor
  dependencies these changes added were a compile-time risk, not a
  behavior-changing one, and the suite confirms nothing broke). No
  frontend collects a Stripe `paymentMethodToken` yet — wiring that in is
  real future work, not a Phase 9 corner cut, since it needs Stripe's own
  client-side hosted fields (Stripe.js/Payment Element), not a backend
  change.

**Phase 10 — Launch readiness.** See `docs/OPERATIONS.md` for the full
detail (CI/CD pipeline, monitoring/alerting stack, load testing,
backup/disaster-recovery scripts and runbooks) — summarized here:
- `.github/workflows/cd.yml` (new): re-verifies CI, builds and pushes
  real Docker images to GHCR, auto-deploys to a `staging` GitHub
  Environment, and gates production behind manual `workflow_dispatch` +
  environment-approval. The build/push half is real and runnable today;
  the two deploy jobs are explicit, clearly-labeled placeholders — this
  project has no actual staging/production infrastructure for a real
  deploy command to target, and writing one that looked real while
  pointing at nothing would be worse than an honest placeholder.
- `apps/api/src/modules/metrics` (new): a dependency-free Prometheus
  text-format `/metrics` endpoint (HTTP request count/duration by
  route, payment outcomes, bookings/payments-by-status, per-supplier
  health) — hand-rolled rather than the `prom-client` package, for the
  same "no reachable npm registry in this sandbox" reason as every other
  Phase 9/10 choice not to add a dependency.
- `infra/monitoring/` (new): a real Prometheus + Alertmanager + Grafana
  Docker Compose overlay, scrape config, and alert rules (API
  reachability, 5xx rate, p95 latency, supplier health, payment failure
  rate) — Alertmanager ships with no real paging integration configured
  (a safe, valid default, not a working one).
- `infra/load-test/` (new): a k6 script and a zero-dependency Node
  fallback, both exercising the search pipeline against this platform's
  mock suppliers by default.
- `infra/scripts/backup-db.sh`/`restore-db.sh` (new): real `pg_dump`/
  `pg_restore` wrappers, with `restore-db.sh` requiring the operator to
  type the target database's name as confirmation before touching
  anything. Scheduling a recurring backup is left to real infrastructure
  (a cron entry with network access to production, or a managed
  Postgres provider's own snapshot feature) rather than a GitHub Actions
  cron job that would almost never actually reach a real production
  database.
- `docs/OPERATIONS.md` (new): the promotion and restore-drill checklists,
  and an explicit "what Phase 10 did not do" section (no real cloud
  infrastructure was provisioned, no Grafana dashboards pre-built, no
  blackbox-exporter wired up) — the same phase discipline this whole
  document has followed throughout, applied to the phase whose entire
  point is "is this actually ready to go live."

**Phase 11 — Real-environment validation, remaining gap closure, and
multi-currency.** Three tracks, all user-directed: close the gaps every
earlier phase had disclosed under its own "what remains," validate the
platform against real infrastructure wherever this sandbox actually
allows it, and add one new feature area (multi-currency/FX).
- **Real Postgres/Redis validation.** This specific sandbox instance
  (unlike every earlier phase's environment) turned out to have real
  `postgresql-16`/`redis-server` binaries and root access — discovered by
  probing rather than assumed. Every hand-written `migration.sql` file
  (0001 through 0006) was applied to a real, empty Postgres database with
  `psql`, cleanly, in order, with zero errors — the strongest schema
  validation this project has had access to at any point. Every
  meaningful constraint (foreign-key cascade deletes, unique constraints,
  enum types, `NOT NULL`) was exercised with real `INSERT`/`DELETE`
  statements, not just inspected. One apparent discrepancy (`updated_at`
  rejecting an insert that omitted it) was investigated and confirmed
  correct, not a bug: `@updatedAt` fields never get a database-level
  default in real Prisma-generated SQL, only `@default(now())` ones do —
  Prisma Client supplies `updatedAt` at write time, which raw `psql`
  naturally doesn't. What this did **not** become: this sandbox still has
  no reachable npm registry, so there is still no real `@prisma/client`,
  no real NestJS boot, and no real end-to-end request exercising this SQL
  through the actual application code — this validated the migration
  files directly, which is real and new, but is not the same claim as "a
  live app was tested."
- **`booking:read:agency` (agency-wide booking visibility).** The
  permission itself, and its grant to `B2B_AGENCY_ADMIN`, already existed
  in RBAC seed data from Phase 3 — the actual gap was that
  `BookingsService` never checked for it. `assertCanView`/`listMyBookings`
  now grant an agency-wide view when the caller holds this permission and
  the target booking's agent belongs to the caller's own agency (never
  across agencies, and department-wide visibility — a separate,
  not-yet-implemented permission — is unaffected). `apps/b2b`'s bookings
  page now shows "Agency bookings" with a "booked by" attribution when
  the caller sees more than just their own.
- **Department-level corporate travel policy overrides.** A new
  `DepartmentTravelPolicy` model (a dedicated table with a plain
  `@unique departmentId`, deliberately not a nullable column on the
  existing `TravelPolicy` model — that would need a partial/conditional
  unique index Prisma's schema language can't express cleanly).
  `TravelPolicyService.evaluate` resolves a department's override first,
  falling back to the corporate default exactly as if overrides didn't
  exist, so no existing corporate (none of which have ever set one) sees
  any change. New admin endpoints
  (`GET`/`POST`/`DELETE /admin/corporates/:corporateId/departments/:departmentId/policy`)
  and an expandable per-department editor on `apps/admin`'s corporates
  page. An override can be stricter OR looser than the corporate default
  — never a one-way "loosen only" escape hatch.
- **jest-shim spec coverage for two previously-untested money/state
  paths.** `HotelsService.createBooking`'s mandatory reprice/price-change
  enforcement and its wallet-vs-payment-gateway settlement branching
  (8 cases), and `VisasService.updateStatus`'s full transition table (every
  declared status against every other, exhaustively, plus the
  `ADDITIONAL_INFO_REQUIRED`⇄`UNDER_REVIEW` loop and history-row
  bookkeeping) — both flagged as gaps in Phase 6's own "what remains."
- **Frontend Stripe checkout, end-to-end.** `paymentMethodToken` is now
  threaded from `CreateBookingDto`/`CreateHotelBookingDto` through
  `BookingsService`/`HotelsService` into `PaymentsService.chargeForBooking`/
  `chargeForHotelBooking` (Phase 9 built the backend half of this and
  left it unreachable — see Phase 9's own "what remains"). On the
  frontend, `apps/web` (flight **and** hotel booking) and `apps/corporate`
  (flight booking — the only booking flow that app has) load Stripe.js
  from Stripe's own CDN via a plain `<script>` tag (no new npm
  dependency, same reasoning as every other Phase 9/10 integration) and
  mount Stripe's hosted Card Element, so a card number is typed directly
  into Stripe's own iframe and never touches this codebase at all — only
  the resulting single-use PaymentMethod id does. Entirely inert (no
  script loads, no card field renders, checkout behaves exactly as
  before) unless `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` is set, so every
  deployment still on the default `MANUAL` provider sees no change.
  `apps/b2b` was deliberately left alone — B2B bookings always settle
  from the agency's own wallet, never a card. `apps/mobile` was
  deliberately left alone too: a real mobile Stripe integration needs the
  native `@stripe/stripe-react-native` SDK, which this sandbox's
  unreachable npm registry makes impossible to add — Stripe.js (a
  browser-only library) cannot substitute for it, so mobile card
  checkout remains real, disclosed future work, not a corner cut.
- **Multi-currency / FX conversion.** A new, opt-in `FxRatesService`
  (`apps/api/src/modules/fx`) — undefined/inert unless `FX_RATES_JSON`
  and/or `FX_PROVIDER_API_URL` is set, so a deployment that never
  configures it keeps this platform's original single-currency-only
  behavior byte-for-byte. `convert()` never guesses: it returns `null`
  whenever FX isn't configured or a currency is missing from whichever
  rate table (static or live) is in use, and every caller treats `null`
  exactly like "FX not available," never like zero. Wired into
  `TravelPolicyService.evaluate`'s cross-currency fare-cap check
  (additively — the pre-existing "never compare mismatched currencies"
  test still passes unchanged as the default path; new tests cover the
  configured path, including a currency pair with no rate still falling
  back correctly) and into `AnalyticsService.getOverview` for both gross
  revenue and wallet-balance reporting. Wiring the latter in surfaced a
  genuine **pre-existing bug**, not just an enhancement opportunity:
  `walletBalanceTotal` had always summed every agency wallet's balance
  across currencies with zero conversion (a USD wallet and a BDT wallet
  just added together) — the exact mistake `grossRevenueByCurrency`'s own
  doc comment was always careful to avoid making. Fixed with a new
  `walletBalanceByCurrency` breakdown (mirroring the revenue side); the
  old field is kept, now explicitly documented `@deprecated`, for
  backward compatibility. Both money aggregates gained an additive
  `*ConvertedTotal` field (`{ baseCurrency, amount, unconvertedCurrencies }`,
  `null` when FX isn't configured) and `apps/admin`'s analytics page now
  shows the per-currency breakdown plus the converted total when
  available, replacing the old misleading single-currency-labeled tile.
  The live-provider path (`FX_PROVIDER_API_URL`) is written strictly to
  the documented shape of exchangerate-api-style providers and this
  codebase's own fall-back-to-static-table-on-any-error contract, but —
  like Amadeus/Stripe in Phase 9 — is **not exercised against a real FX
  API**: this sandbox has no network access to one.
- Verification: `synchk`/`importchk`/typecheck all still 0 problems
  across `apps/api` (158 files), `apps/web` (40), `apps/admin` (15), and
  `apps/corporate` (21). The jest-shim suite grew from 57 to **128
  passed, 0 failed** — every pre-existing test still passes unchanged,
  and every new one (hotel settlement, visa transitions,
  `PaymentsService` idempotency/token-threading, `FxRatesService`'s full
  static-table/live-provider/fallback matrix, and `AnalyticsService`'s
  currency-fix + FX wiring) is new coverage, not a replacement for
  anything that existed before.
- What remains: no live Stripe/Amadeus/FX-provider account was ever
  reachable from this sandbox, so the Stripe checkout flow and the FX
  live-provider path are both real-but-unverified against their actual
  third parties — the same honest posture Phase 9 already established,
  now extended to two more integrations. `apps/mobile` still has no
  Stripe checkout (see above). Department-wide (as opposed to
  agency-wide) booking visibility is still not implemented — `assertCanView`
  still denies it by default, exactly as disclosed when `booking:read:agency`
  was added. No FX rate table ships configured by default — an operator
  must set `FX_RATES_JSON` themselves, deliberately, since inventing
  default exchange rates that go stale is worse than shipping none.

**Phase 12 — Hajj & Umrah packages, WhatsApp contact, and an AI
assistant chat widget.** User-directed: "add a Hajj/Umrah option where
users can browse upcoming packages, book, and pay a partial deposit;
let the business reach customers by WhatsApp/phone/email; add an AI
agent that can answer questions and pull live package data." Four
clarifying questions were asked and answered before building — the
answers below are the user's, not assumptions.
- **Package model — extends the packages domain, not the literal
  Phase 6 `TravelPackage`.** The user chose "extend the existing
  packages feature" over a new dedicated catalog, but the literal
  `TravelPackage`/`PackagesService` (a thin wrapper tying one already-
  CONFIRMED flight `Booking` to one already-CONFIRMED `HotelBooking`)
  has no concept of a future dated departure, capacity, or a deposit —
  it structurally cannot support "browse upcoming packages." Honoring
  the spirit of the answer rather than its letter, this phase adds new
  models (`HajjUmrahPackage`, `HajjUmrahBooking`) and a new
  `HajjUmrahService`/`HajjUmrahModule` alongside `PackagesService`,
  inside the same packages domain, rather than replacing it or bolting
  a browsing feature onto a model that isn't shaped for it. `Payment`
  gained a third nullable `hajjUmrahBookingId` column on the same
  polymorphic pattern as `bookingId`/`hotelBookingId` (see its own
  doc comment) — `PaymentsService.chargeForHajjUmrahBooking` mirrors
  `chargeForHotelBooking` exactly, including its idempotency-per-call
  semantics, which is also what lets one booking be charged more than
  once over its lifetime (the deposit, then any number of later
  installments) with no new idempotency design needed.
- **Deposit rule — admin's choice of PERCENTAGE or FIXED, plus the
  customer can always pay more upfront.** The user's answer was "all
  of the above": `HajjUmrahPackage.depositType`/`depositValue` let an
  admin set the minimum deposit as either a percentage of the total or
  a fixed amount, and `CreateHajjUmrahBookingDto.paymentAmount` lets a
  customer voluntarily pay more than that computed minimum at booking
  time (never less — enforced server-side, not just in the frontend
  form). One interpretation was a genuine judgment call, disclosed
  here rather than silently assumed: a FIXED deposit is per PILGRIM,
  not a flat amount for the whole booking, so it scales with group
  size the same natural way a PERCENTAGE deposit already does — see
  `HajjUmrahService.calculateMinimumDeposit`'s doc comment. Status
  moves `PENDING_DEPOSIT` → `DEPOSIT_PAID` (exactly the minimum paid)
  or `PARTIALLY_PAID` (more than the minimum but short of the total,
  whether from a large first payment or a partial installment) →
  `FULLY_PAID`, covered by 17 new jest-shim tests (below).
- **Booking flow — reserve-then-charge, matching `BookingsService`/
  `HotelsService`'s existing discipline exactly.** Seats are reserved
  and the booking row created inside one `$transaction`
  (re-verifying `active`, a future `departureDate`, and
  `seatsBooked + pilgrims <= capacity`), then the initial deposit is
  charged OUTSIDE that transaction — a provider failure never rolls
  back the seat reservation, it leaves the booking `PENDING_DEPOSIT`
  with `amountPaid: 0` and the customer retries via a new
  `POST /hajj-umrah/bookings/:id/payments` endpoint. Two honestly-
  disclosed tradeoffs, not oversights: (1) there is no seat-hold-expiry
  mechanism, so an abandoned `PENDING_DEPOSIT` booking occupies a seat
  indefinitely; (2) `seatsBooked` is re-read and incremented inside the
  transaction with **no row-level lock** (`SELECT ... FOR UPDATE`) —
  deliberately matching, not exceeding, the rigor `WalletService.applyTransaction`
  already uses for wallet balances elsewhere in this codebase, so two
  concurrent bookings against the very last seat(s) of a near-full
  package could in principle both pass the capacity check before either
  commits. Public browse endpoints (`GET /hajj-umrah/packages`,
  `GET /hajj-umrah/packages/:id`) need no auth, mirroring
  `GET /flights/search`; booking/payment endpoints need a signed-in
  user (any authenticated role, like hotel/flight booking); admin CRUD
  (`/admin/hajj-umrah/packages`, `/admin/hajj-umrah/bookings`) is gated
  by a new `HAJJ_UMRAH_MANAGE` permission, granted to `SUPER_ADMIN`
  and `OPS_SUPPORT`.
- **Contact channels — WhatsApp got the real integration; phone stays
  click-to-call by design.** The user's answer was "both" (simple
  links AND real automated messaging), built as: a new
  `WhatsAppProvider` interface + `MockWhatsAppProvider` (default) +
  `WhatsAppCloudApiProvider` — a real integration against Meta's
  WhatsApp Cloud API via `fetch`, selected only when
  `WHATSAPP_PROVIDER_STRATEGY=META` and credentials are configured,
  falling back to the mock with a boot warning otherwise (the exact
  dual-gate shape as `PaymentsModule`'s Stripe/Manual selection).
  `NotificationsService.sendHajjUmrahBookingConfirmed` now sends a real
  WhatsApp message on every deposit/installment payment, alongside the
  still-mock email leg. **Not exercised against a live Meta account**
  in this build — no network access to `graph.facebook.com` from this
  sandbox — same honest posture as Stripe/Amadeus in Phase 9. One real
  limitation of this specific implementation, disclosed rather than
  hidden: it only sends free-form text messages, which Meta's API
  rejects outside the 24-hour customer-service window unless a
  pre-approved message template is used instead — template messages
  are not implemented. A judgment call, made rather than re-asked:
  automated outbound **phone calls** were deliberately not built —
  there is no legitimate way to auto-dial a customer without a voice/
  IVR product, disproportionate to this feature — so phone stays a
  plain `tel:` link a visitor taps themselves, everywhere WhatsApp and
  email are also offered as `wa.me`/`mailto:` links via a new, reusable
  `ContactWidget` component (`apps/web`).
- **AI assistant — extended with two new tools, and a chat widget UI
  built from scratch.** The user's answer was "both" (live package
  lookups AND general company Q&A). `AiAssistantService` (built in
  Phase 8, previously flight/hotel-only) gained `search_hajj_umrah_packages`
  and `get_hajj_umrah_package_details` tools, following its established
  "never invent live data, always call the tool" discipline, plus an
  updated system prompt with real Mohammad Travels & Tours company
  facts (office addresses, director, phone/WhatsApp/email, services) —
  sourced from the site's own footer/header, the one place these facts
  already lived, rather than invented. A genuine gap was discovered
  while doing this: **no frontend chat UI existed anywhere in this
  codebase** for the fully-built Phase 8 backend — `apps/api`'s
  `/assistant/chat`/`/assistant/status` endpoints had zero callers. A
  new floating `AiChatWidget` (`apps/web`, mounted globally in the root
  layout) is the first UI this backend has ever had: optionally-
  authenticated exactly like the endpoint, hidden entirely when the
  server has no `ANTHROPIC_API_KEY` configured. Still, as Phase 8
  always disclosed, **not executed against the real Anthropic API** —
  no network access to it from this sandbox — reviewed for correctness,
  not run live.
- **Real Postgres validation of the new schema.** Migration `0007`
  (`HajjUmrahPackage`, `HajjUmrahBooking`, `Payment.hajjUmrahBookingId`)
  was applied to this sandbox's real Postgres instance and exercised
  with real `INSERT`/`UPDATE`/`DELETE` statements, the same rigor as
  Phase 11's migration validation: multi-installment payments against
  one booking (two `Payment` rows, one `hajjUmrahBookingId`, distinct
  idempotency keys), the `idempotency_key` unique index's NULL
  semantics (two NULL rows coexist; a duplicate real key is rejected),
  `RESTRICT` correctly blocking a package delete while bookings exist,
  and `CASCADE` correctly removing a booking's payments when the
  booking itself is deleted.
- **jest-shim spec coverage.** 17 new tests for `HajjUmrahService`
  (`hajj-umrah.service.spec.ts`): both deposit-calculation branches,
  the capacity guard (including the exact-fit boundary and an inactive
  package), all four status transitions, the failed-charge/seat-stays-
  reserved tradeoff, idempotent retry behavior, `paymentMethodToken`
  threading through both `createBooking` and `addPayment`, and
  ownership enforcement on `addPayment`.
- Verification: `synchk`/`importchk` both still 0 problems across
  `apps/api` (169 files), `apps/web` (48), `apps/admin` (16),
  `apps/corporate` (21), `apps/b2b` (20), and `packages/types` (6). The
  jest-shim suite grew from 128 to **145 passed, 0 failed** — every
  pre-existing test still passes unchanged.
- What remains: no live WhatsApp (Meta) or Anthropic account was ever
  reachable from this sandbox, so both integrations are real-but-
  unverified against their actual third parties, matching Phase 9's
  established posture. WhatsApp template messages (needed outside
  Meta's 24-hour customer-service window) are not implemented — only
  free-form text. There is no seat-hold-expiry mechanism and no
  row-level locking on `seatsBooked` (both disclosed above as
  deliberate, codebase-consistent tradeoffs, not oversights).
  Automated outbound phone calls were deliberately not built — phone
  remains click-to-call only, a product judgment rather than a gap.
  Hajj/Umrah bookings have no cancellation/refund flow yet — unlike
  flights and hotels, there is currently no way to cancel one or
  reverse its payments through this platform once created.

**Phase 13 — Brand rename, header/nav redesign, a Manpower job-placement
vertical, and a flight search/policy pass.** User-directed: rename the
brand to "Muhammad Tours and Travels"; redesign the landing page header
(logo + name top-left, login/registration top-right, a menu bar with
Book Flight, Hajj and Umra, Manpower, Visa Service, About Us, Contact
Us); improve flight search/selection/booking/details "like Agoda and
Singapore Airlines," with baggage/refund/cancellation/date-change policy
shown throughout. Two rounds of clarifying questions were asked; several
answers came back as "both" against options that were designed to be
mutually exclusive. Every place that happened is called out below,
disclosed rather than silently assumed.
- **Brand rename — user-facing text only, not the internal npm scope.**
  Confirmed explicitly in the second clarifying round: every
  human-readable occurrence of "Mohammad Travels" / "Mohammad Travels &
  Tours" (headers, footers, page titles, login screens, the AI
  assistant's system prompt, the mock booking-confirmation message
  string, the mobile app's display name, and this docs set's own
  headers) is now "Muhammad Tours and Travels." The internal npm
  package scope (`@mohammad-travels/types`, `@mohammad-travels/api`,
  etc.) and the root `package.json` `"name"` field were deliberately
  **left unchanged** — renaming that scope would touch every import
  statement across the whole monorepo for a purely internal identifier
  nobody using the product ever sees, and the user's request was about
  the landing page's branding, not the codebase's package names. This
  scoping choice was not itself asked about — it's a low-risk, easily
  reversible judgment call in the same spirit as this file's other
  disclosed assumptions, not a second binary decision on the level of
  the rename itself.
- **Header/nav — merged, not replaced (Round 1's "both").** The
  clarifying question offered "replace the nav with exactly the
  requested six items," "add them to the existing nav," or "replace and
  remove the old pages"; the answer was "both," which doesn't parse
  against three mutually exclusive options. Read as "keep everything
  reachable, but the requested wording wins" — the safer, non-destructive
  reading — `SiteHeader` now ships the exact two-row layout asked for
  (logo + brand name and login/registration on row one; a single menu
  bar on row two) merging the six requested items with the three pages
  that already existed (Hotels — relabeled "Hotel Booking" per an
  in-session follow-up request — Packages, Manage Booking) into one
  nine-item bar, reconciling the obvious duplicates under the newer
  wording ("Flights" → "Book Flight," "Hajj & Umrah" → kept as the
  correctly-spelled label rather than the requested typo "Hajj and
  Umra," "Visas" → "Visa Service"). The old thin contact-info strip
  above the header (phone/email/tagline) was removed to match the
  user's literal "top row = logo + login" description — that
  information didn't disappear, it now lives on the new **About Us**
  and **Contact Us** pages the nav links to (built from the same
  office/phone/email facts `SiteFooter` already carried).
- **Manpower — built as a full application workflow, not an
  informational page (Round 2's "both," again).** Asked to choose
  between "informational page for now" and "full workflow with a real
  catalog, apply flow, and admin review queue," the answer was "both" a
  second time; read as choosing the superset (a full workflow's own
  landing page already carries the informational content a static page
  would). This shipped a genuinely new vertical, sized like Phase 12's
  Hajj/Umrah build: `ManpowerJob` (an admin-managed, publicly browsable
  catalog — country, employer, category, positions available/filled,
  salary range, contract length, requirements/benefits, deadline) and
  `ManpowerApplication` (a document/workflow record like
  `VisaApplication`, not a paid booking — see below) plus
  `ManpowerStatusHistory` as its audit trail, migration `0008_manpower`,
  a new `Permission.MANPOWER_MANAGE` (granted to `OPS_SUPPORT` alongside
  `HAJJ_UMRAH_MANAGE`), a full `ManpowerService`/`ManpowerController`
  (public browse, authenticated apply + self-service withdraw, admin
  CRUD + status-transition review queue), `apps/web` browse/detail-
  apply/my-applications pages, and an `apps/admin` job-CRUD +
  application-review page.
  - **Deliberately no fee, deposit, or payment field anywhere in this
    vertical** — not a judgment call the user was asked about, since it
    isn't really an interpretation of ambiguous instructions but a
    considered omission: charging job seekers a recruitment fee is a
    well-documented abuse pattern in overseas labor migration, and nothing
    in the request asked for one. If a legitimate processing fee is
    ever wanted, it should be modeled explicitly and reviewed, not
    backed in silently as "just another Payment row."
  - **Status model**: `SUBMITTED → UNDER_REVIEW → SHORTLISTED →
    INTERVIEW_SCHEDULED → SELECTED → VISA_PROCESSING → DEPLOYED`
    (terminal), with `REJECTED` reachable from any non-terminal state
    and `WITHDRAWN` self-service up to and including
    `INTERVIEW_SCHEDULED` — once `SELECTED`, an offer is already in
    motion, so withdrawal beyond that point goes through staff/REJECTED
    instead, keeping `positionsFilled` and the audit trail meaningful.
- **Flight search/selection/booking/details "like Agoda and Singapore
  Airlines."** Most of the underlying data this asked for already
  existed (`FlightOffer.baggageCheckedKg/CarryOnKg/Note`,
  `refundable`/`changeable` booleans, and a `fareRules` JSON carrying a
  `changeFee`/`refundFee` per fare) but wasn't fully surfaced or typed
  on the frontend — this phase tightened `OfferFareRules`'s type and
  surfaced cancellation/date-change fee amounts (not just the booleans)
  on the fare-details page and the booking review step. `FlightSearchForm`
  gained an SIA-style segmented trip-type control in place of radio
  buttons; the results page gained an Agoda-style filter sidebar (stops,
  refundable-only, airline) alongside the existing sort control. A new
  general **`/policies`** page (baggage, refund, cancellation, date-change
  — platform mechanics, not one specific real airline's terms) is linked
  from the fare-details page and the booking review step, satisfying
  Round 1's "both" answer on fare-policy data as **both** real
  per-fare structured numbers **and** a general policy page, which is
  the one Round-1 "both" that combines cleanly with no real conflict.
- **What was not attempted**: a pixel-level clone of either Agoda's or
  Singapore Airlines' actual UI (their real layouts are copyrighted
  designs, not something to reproduce line-for-line) — this phase
  matched the *conventions* those sites are known for (segmented
  trip-type control, from/to swap, a filter sidebar, fare-specific
  policy figures with a link to the full policy) using this codebase's
  own existing design system, not their visual identity.
- Verification: `synchk`/`importchk` both 0 problems across `apps/api`
  (176 files), `apps/web` (55), `apps/admin` (17), and `packages/types`
  (7) — `apps/corporate`/`apps/b2b` were untouched this phase. The
  jest-shim suite grew from 145 to **216 passed, 0 failed**, the new 71
  tests covering `ManpowerService`'s transition table exhaustively (every
  declared from/to pair) plus the applicant-facing `withdraw()` path's
  ownership and terminal-state checks. Migration `0008_manpower` was
  applied against this sandbox's real Postgres instance (not just
  hand-checked) — doing so surfaced that `customers`/`agents`/
  `employees`/`users` are owned by a different Postgres role than the
  one migrations run as here, requiring a one-time `GRANT REFERENCES,
  SELECT` before the new foreign keys could be added; noted here since
  it's infrastructure-shaped, not a schema decision.
- What remains: the flight-policy work is still against this
  platform's demo/mock supplier data, not a real airline's actual fare
  rules (per every prior phase's established posture on mock vs. real
  suppliers). Manpower has no document-upload capability (CV/passport
  scan) — applications are text fields only. There is no employer-facing
  portal; job postings are admin-only. The nav's nine items are a lot for
  one bar on a narrow phone screen — it scrolls horizontally rather than
  wrapping, which works but wasn't tested against a real device.

**Phase 13, follow-up — homepage hero tab switcher and auto-playing
carousels.** User-directed, same day: improve the main menu area below
the hero with an auto-playing offers/popular-destinations carousel, and
make the hero itself hold flight search, hotel search, and other search
interfaces, switched by a menu, defaulting to flight search.
- **Interpretation disclosed**: "hero section below flight search, hotel
  search and others search interface placed when users select from main
  menu" was read as a tab switcher *inside the hero itself* (Flights /
  Hotels / Hajj & Umrah / Manpower), not the site header's own nav —
  the header's Book Flight/Hotel Booking/Hajj & Umrah/Manpower items
  still route to their full dedicated pages (search results, browse-all,
  apply, manage), which the hero's compact forms cannot replace. This is
  the same pattern Agoda/Expedia use (a tab bar inside the hero, separate
  from the site's own top nav), and it's what "others search interface"
  most plausibly means, since Visa Service and Packages are
  authenticated action forms, not public search/browse surfaces, and
  don't fit a "search interface" tab.
- Flights and Hotels tabs embed the existing `FlightSearchForm`/
  `HotelSearchForm` unchanged. Hajj & Umrah and Manpower — which don't
  have a comparable "search form," just a browsable catalog — get a
  lightweight type/country picker that deep-links to `/hajj-umrah?type=`
  and `/manpower?country=` respectively; both list pages were given a
  one-time `useSearchParams` read (wrapped in `Suspense`, matching the
  login/register pages' existing pattern) so the link actually lands
  pre-filtered. Flights is the default active tab, per the request.
- **New `Carousel` component** (`components/carousel.tsx`) — a small,
  dependency-free auto-advancing slider (no carousel library added):
  translateX-based sliding, pauses on hover/focus so it never fights a
  visitor mid-read or mid-click, always exposes manual prev/next + dot
  controls rather than relying on auto-play alone. Used twice below the
  hero: an "Offers & services" carousel (four CTA banners — deliberately
  no invented prices or discount percentages, the same rule
  `POPULAR_DESTINATIONS` already followed, since a fabricated "20% off"
  would read as a real offer) and the existing "Popular destinations"
  grid, now auto-cycling through pages of four rather than showing all
  eight at once.
- Verification: `synchk`/`importchk` both 0 problems across `apps/web`
  (56 files, up from 55). The jest-shim suite is backend-only and
  unaffected by this frontend-only change — still 216 passed, 0 failed.
- What remains: the offers carousel's four cards are static/hand-written,
  not driven by any admin-configurable "promotions" model — there is no
  backend concept of a promotion to manage, so adding or changing an
  offer today means editing `page.tsx`, not an admin screen. The
  destination carousel still uses the same eight hand-picked airports as
  before; nothing here makes that list dynamic or usage-driven.

## Phase 13, final pass — responsive polish and publish-readiness check

Requested as the closing step of this engagement: make the interfaces built
in this phase fit properly on every device size, then run a final,
comprehensive functional/error check before treating the build as
publish-ready.

- **Header (`site-header.tsx`)** — the top row (logo + login/registration)
  now wraps (`flex-wrap` with `gap-x-4 gap-y-2`) instead of clipping on
  very narrow phones, with slightly smaller logo/type sizing below the
  `sm` breakpoint and reduced horizontal padding (`px-4` under `sm`, `px-6`
  above) so more of the row fits before wrapping is ever needed.
- **Homepage hero tab switcher (`page.tsx`)** — rewritten from one shared
  `rounded-full` pill containing all four tabs (which had no inter-button
  gap, so a forced wrap on a narrow screen would have rendered the
  buttons touching) to individually-pilled buttons in a
  `flex flex-wrap gap-2` row. Each tab now looks correct whether it's on
  one row or has wrapped to two.
- **Spot-checked and fixed narrow-width (~360–400px) layout** across every
  page touched in this phase and its follow-up: the search-results filter
  sidebar's sort-by row, the offer detail page's title/DEMO-badge row, the
  booking flow's step indicator and the two flight-summary/price rows on
  the review step, the manpower "my applications" list and the admin
  manpower job/application list rows (long titles or applicant names could
  force a horizontal overflow instead of wrapping to a second line — all
  given `flex-wrap` + `min-w-0` + `break-words` where a text block sits
  next to a fixed-width badge/button). The travelers-and-class dropdown in
  `FlightSearchForm` is capped at `max-w-[calc(100vw-2rem)]` so its fixed
  `w-72` panel can no longer push the page into horizontal scroll on a
  narrow viewport. `HotelSearchForm`/`FlightSearchForm`'s main From/To/date
  row and the multi-city row already stacked correctly (`flex-col
  sm:flex-row`, `flex-wrap` with `min-w-[…]`) from earlier phases and
  needed no change.
- **Final verification sweep, run fresh for this pass:**
  - `synchk` (esbuild syntax check): `apps/api/src` 176 files, `apps/web/src`
    56 files, `apps/admin/src` 17 files, `apps/corporate/src` 21 files,
    `apps/b2b/src` 20 files — 0 syntax errors anywhere.
  - `importchk` (import-resolution check): same five app roots, 0 import
    problems.
  - jest-shim backend suite: 216 passed, 0 failed (unchanged — this pass
    touched frontend files only).
  - Manual check: every `SiteHeader` nav link (`/`, `/hotels`, `/packages`,
    `/hajj-umrah`, `/manpower`, `/visas`, `/manage-booking`, `/about`,
    `/contact`) resolves to a real page file; every custom Tailwind color
    class used in the touched files (`dusk-*`, `sand`, `tangerine*`,
    `ground`) exists in `tailwind.config.ts`; no leftover `TODO`/`FIXME`/
    placeholder text in the touched app source.
- What remains (disclosed honestly, not fixed in this pass): this sandbox
  has no installable `node_modules` and no network access to fetch one
  (confirmed again this pass — see earlier entries in this doc), so there
  is still no real `next build`/`tsc --noEmit`/`next dev` run possible
  here, and therefore no actual browser or device-lab confirmation of
  these responsive fixes — the changes above are standard, low-risk
  Tailwind wrapping patterns already used successfully elsewhere in this
  codebase, verified by syntax/import checks and code review, not by a
  rendered screenshot at each breakpoint. Before a real production
  release, run `next build` and click through the site at common
  breakpoints (~360px, ~768px, ~1024px, desktop) in an environment with
  package installation and a browser available.

## Phase 14 — Admin control panel/dashboard rebuild, and login security overhaul

Requested: *"improve admin control panel and dashboard, admin login
backend, user friendly advanced."* Scoped up front with three clarifying
questions before any code changed; the answers below are exactly what was
built — nothing more, nothing assumed:

- **Login security** — all three offered options, plus a fourth
  requirement typed in by hand: forgot-password/reset-via-email, optional
  TOTP 2FA, a "last login" + active-sessions list with per-device revoke,
  **and** phone number made mandatory (address optional) on registration
  platform-wide.
- **Dashboard** — "both": a live KPI overview wired to real analytics
  endpoints, *and* a visual restyle (icon tiles, badges, cards) — not one
  or the other.
- **Admin shell** — a mobile-responsive collapsible sidebar, and grouped
  nav sections with a top bar (search + account menu). A pending-approvals
  notification indicator was offered as a third option and **deliberately
  left out** — not selected.

### Database

`prisma/migrations/0009_login_security` adds to `users`: `phone_number`
(nullable — existing rows aren't backfilled, see "What remains" below),
`address`, `last_login_at`, `two_factor_enabled`, `two_factor_secret`,
`two_factor_backup_codes`; and a new `password_reset_tokens` table
(hashed token, expiry, single-use `used_at`). Applied to the real
Postgres instance the same way Phase 13's migrations were — the `ALTER
TABLE users` statements run as the `postgres` superuser (the table is
owned by it, not the app role `mt_app`), the new table created normally
through `mt_app`.

### Backend (`apps/api`)

- `RegisterDto` now requires `phoneNumber` (`+`-optional, 7–15 digits)
  and accepts an optional `address` — enforced the same way for every
  account type (B2C, B2B, corporate), since the platform has one
  registration endpoint underneath all of them.
- **Two-factor authentication** is a from-scratch RFC 4226/6238
  (HOTP/TOTP) implementation in plain Node `crypto` — this sandbox has no
  network access to install `otplib`/`speakeasy`, so it was written by
  hand and checked against the official RFC 6238 Appendix B test vectors
  before use (`totp.util.spec.ts`, 9 passing cases). Login is now
  two-step when 2FA is on: `POST /auth/login` returns a short-lived
  challenge token instead of tokens directly; `POST /auth/2fa/verify`
  (rate-limited: 8 attempts/15 min per IP+token) accepts either a 6-digit
  TOTP code or one of ten single-use backup codes and only then issues
  real access/refresh tokens. The challenge token is signed with the
  refresh secret, not the access secret, specifically so it can never be
  replayed as a Bearer token against a protected route even if
  intercepted. `POST /auth/2fa/enable` / `/confirm` / `/disable` manage
  setup (secret + backup codes, confirmed with one valid code before
  it's actually turned on).
- **Forgot/reset password**: `POST /auth/password-reset/request` always
  returns success whether or not the email is registered (the same
  anti-enumeration property `validateCredentials` already had elsewhere
  in this codebase), emails a time-limited link (mocked/logged —
  `NotificationsService`, no real email provider wired up, unchanged
  from every other notification in this platform), `POST
  /auth/password-reset/confirm` consumes it once and signs the user out
  everywhere by rotating their refresh token.
- **Sessions**: every successful login stamps `lastLoginAt`; `GET
  /auth/sessions` and `DELETE /auth/sessions/:id` list and revoke
  individual refresh-token sessions per device.
- `AnalyticsService.getOverview()` gained a `manpowerApplications`
  breakdown (Manpower shipped in Phase 13 without one) — needed so the
  new admin dashboard's "needs your attention" tile has a real number to
  show instead of a placeholder.

### Admin app (`apps/admin`)

- **Login** (`/login`) now has a 2FA code-entry step, a show/hide password
  toggle, and a "Forgot password?" link; **new** `/forgot-password` and
  `/reset-password` pages; **new** `/security` page for
  enabling/disabling 2FA (secret + manual-entry `otpauth://` URI and
  backup codes — see "What remains" for why there's no scannable QR
  image) and viewing/revoking active sessions.
- **Dashboard** (`/dashboard`) rebuilt around three sections: "Needs your
  attention" (agency + manpower approval counts, linking straight to the
  filtered list), "At a glance" (live revenue-by-currency, agency/
  corporate/hotel counts from `AnalyticsOverview`), and a restyled
  "Platform modules" grid (icon tiles instead of a plain link list) plus
  a live recent-activity feed off the audit log. A "Visa applications"
  tile was drafted and then removed — see "What remains".
- **Shell** (`admin-shell.tsx`) rebuilt: the sidebar is a slide-out
  drawer below the `lg` breakpoint (it previously just broke — a fixed
  grid column with no mobile treatment at all) with an overlay and
  auto-close on navigation; the 11 nav links are now grouped under four
  headings instead of one flat list; a new top bar adds a jump-to-module
  search box and an account/profile menu (name, roles, a link to
  Security, sign out) in place of the old bare "Signed in as" text row.
  No approvals-notification indicator was added, per the scoping answer
  above.

### Web, B2B, corporate, and mobile apps

Since `phoneNumber` is now required by the shared registration endpoint,
every client that registers accounts needed the field or real signups
would start failing with a 400 the moment this went live:
- `apps/web` and `apps/b2b` registration forms gained a required Phone
  number field and an optional Address field; `apps/mobile`'s
  `RegisterScreen` got the same two fields (address optional, its "Create
  account" button now also requires a non-empty phone number).
- `apps/web`, `apps/b2b`, `apps/corporate`, and `apps/mobile` all had
  `login()`'s return type widened to include the 2FA-challenge shape and
  gained a defensive branch that shows a clear "not supported here yet,
  contact support" message instead of crashing on the new response
  shape. In practice this should never trigger for these apps — the only
  place an account can actually turn 2FA *on* is the admin Security page
  built in this phase — but a defensive check costs little and a silent
  crash on a malformed assumption costs a lot.
- New `apps/web` `/forgot-password` and `/reset-password` pages, styled
  to that app's own palette (`dusk`/`sand`/`tangerine`), with a "Forgot
  password?" link added to `/login`. B2B and corporate accounts are
  provisioned by an agency application review / a travel manager
  respectively (both already had no self-service reset flow before this
  phase either), so no reset pages were added there — out of scope
  unless a future pass is asked to add them.

### What remains (disclosed, not fixed in this pass)

- **No admin review page for visa applications.** Discovered while
  building the dashboard's approval tiles — `AnalyticsOverview` already
  returns a `visaApplications` needs-review count, but there is no
  `apps/admin` page to send an operator to review one. This predates
  this phase; rather than link the new dashboard tile to a dead end (or
  invent a page as a side effect of a dashboard task), the tile was left
  out. A visa-applications admin screen is a reasonable follow-up task
  on its own.
- **No scannable QR code for 2FA setup.** The Security page shows the
  raw secret and an `otpauth://` URI for manual entry into an
  authenticator app, because generating a QR *image* needs a library
  this sandbox has no network access to install. Swapping in a QR
  library (or a client-side QR-drawing snippet) is a small, isolated
  follow-up.
- **`phone_number` is nullable and not backfilled** for accounts that
  registered before this migration — enforcing it as required only on
  *new* registrations, not retroactively on existing rows, was a
  deliberate choice to avoid inventing phone numbers for real accounts.
  A follow-up could prompt existing users to add one on next login if
  that's ever wanted.
- **Extended 2FA/reset-password backend tests are written for real CI
  only, not this sandbox's local harness.** This sandbox's jest-shim
  only stubs `@nestjs/common` — nothing that imports `AuthService`
  (which needs `@nestjs/jwt`, `@nestjs/config`, and `argon2`, none of
  which are stubbed) can execute here, which is also why the
  pre-existing `auth.service.spec.ts` was never runnable locally either.
  `auth.service.two-factor-reset.spec.ts` follows that same precedent:
  written to real-Jest quality, intentionally left out of the local
  `run.mjs` registry, and documented as such in its own header comment.
  The dependency-free TOTP algorithm itself *is* tested locally
  (`totp.util.spec.ts`, registered and passing).
- **Same sandbox limitation as every prior phase**: no installable
  `node_modules`, so still no real `next build` / `tsc --noEmit` /
  browser run possible here. Before production release, run a real
  build across all five apps and click through login, 2FA setup, the
  forgot/reset-password flow, and the new dashboard/shell at a few
  breakpoints in an environment with package installation and a browser.

### Final verification sweep for this phase

- `synchk` (esbuild syntax check): `apps/api/src` 183 files, `apps/web/src`
  58 files, `apps/admin/src` 20 files, `apps/corporate/src` 21 files,
  `apps/b2b/src` 20 files, `apps/mobile/src` 27 files — 0 syntax errors
  anywhere.
- `importchk` (import-resolution check): `apps/api`, `apps/web`,
  `apps/admin`, `apps/corporate`, `apps/b2b` — 0 import problems (mobile
  has no equivalent import-check script in this sandbox; its
  syntax-checked cleanly and its edits mirror the web app's exactly).
- jest-shim backend suite: **226 passed, 0 failed** (216 carried over
  from Phase 13 + 10 new TOTP-utility cases; the analytics spec's fake
  Prisma client was updated alongside the new `manpowerApplication`
  aggregation so it didn't start throwing on an untyped mock).

## Phase 15 — Flight search: outbound/return leg separation, corrected filtering, and search UX improvements

Requested: *"improve flight search option as a flight search expert."*
Investigation found the search/booking pipeline already had a capable
multi-supplier orchestrator (concurrent fan-out, per-supplier
timeout/health tracking, dedupe+markup+ranking — see
`flight-search-orchestrator.service.ts`/`flight-normalization.service.ts`),
but a real architectural gap sat underneath every frontend:
`FlightOffer.segments` is stored as ONE flat, sequence-ordered list
spanning every searched leg — a round trip's outbound and return
segments sit in the same array with nothing marking where one ends and
the next begins. Every consumer of that data — the results-list card,
the offer-detail page, and the booking-flow summary strip, in all four
apps — inherited the same two consequences:

- A copy-pasted bug showing the LAST segment's *departure* time as the
  itinerary's arrival time (`last.departureAt` instead of
  `last.arrivalAt`), present verbatim in `apps/web`, `apps/b2b`,
  `apps/corporate`, and `apps/mobile`.
- No way to tell a genuine same-leg connection from the multi-day gap
  between a round trip's outbound arrival and return departure — the
  offer-detail page labeled BOTH as "Layover in X", and the results
  card's "N stops" summed stops across both directions (1 stop each way
  displayed as "2 stops").

**Fix, built once and reused everywhere**: `packages/types/src/itinerary.ts`
adds `groupSegmentsByLeg()`, a dependency-free generic utility that
reconstructs the searched legs (outbound/return, or each MULTI_CITY hop)
from the flat segment list, using the *searched* leg boundaries — not
timing gaps — as ground truth for where one leg ends and the next
begins, so a real layover and the gap between legs can never be confused
regardless of trip length. `flights.controller.ts` computes this once,
server-side, for all three endpoints (`POST /flights/search`,
`GET /flights/search/:id`, `GET /flights/offers/:id`) and embeds it as a
new `legs` field alongside the existing flat `segments` (kept for any
caller not yet updated). Matching is case-insensitive, protecting
against a latent casing inconsistency between `FlightSearchSegment`
(uppercased at persist time) and `FlightOffer`'s own physical segments
(which preserve whatever case a request arrived in).

**Every frontend updated to use it**: `apps/web`, `apps/b2b`,
`apps/corporate`, and `apps/mobile` all got `flight-types.ts` extended
with `OfferLeg`/`OfferLayover`, and a new shared `lib/itinerary.ts` per
app (`legsFor`/`legLabel`/`routeSummary`) so the grouping/labeling logic
lives in one place instead of being copy-pasted across each app's
offer-card, offer-detail page, and booking-flow summary strip — all
three were rewritten to render outbound/return/multi-city as distinct
blocks with correct per-leg stats and genuine layover detail (connecting
airport + duration).

**Search results (`apps/web`, `apps/b2b`, `apps/corporate`)**: the
"stops" filter now compares each offer's WORST leg (`Math.max` across
`legs[].stops`) instead of the misleading cross-leg sum, and its middle
bucket was relabeled "1 stop or fewer" to match the cumulative semantics
every major flight-search tool uses (a nonstop offer correctly appears
under "1 stop or fewer" too). Airline filtering changed from
single-select radio to multi-select checkboxes. A new "Best" sort
(default, matching Google Flights' convention) blends normalized price
and duration 60/40 against the currently-filtered set. `apps/b2b` and
`apps/corporate` had no filter sidebar at all before this phase — both
now match `apps/web`'s.

**What was not attempted**: the post-booking confirmation page
(`bookings/[id]`, all four apps) is served by `BookingsController`, a
separate controller with its own `Booking.offer` type that has no
`legs` field — it already renders every segment individually with
correct per-segment times (no mislabeling), but its one summary line
still shows the aggregate stops count. Fixing this means extending a
controller this phase didn't touch; left as a known, disclosed gap
rather than a silent scope-creep into a second controller. `apps/mobile`
still has no stops/refundable/airline filter UI (only sort) — building a
filter sheet in React Native without a way to visually verify it felt
like the wrong tradeoff to rush; its card/detail rendering and sort
options are fixed and correct.

## Phase 15, verification pass — syntax check, strict type-check, and executed behavioral tests

Requested: *"check all function as real workable and fix error."* This
sandbox has no network access and no installed `node_modules` for any
app (the same constraint every earlier phase in this document has
disclosed), so a real `next build`/`tsc --noEmit` across the
NestJS/Next.js dependency graph isn't possible here. What was actually
run instead:

- **Syntax check, whole repo**: every `.ts`/`.tsx` file (348 total:
  `apps/api` 184, `apps/web` 60, `apps/b2b` 22, `apps/corporate` 23,
  `apps/admin` 21, `apps/mobile` 30, `packages/types` 8) parsed with the
  TypeScript compiler's own parser (`ts.transpileModule`, which needs no
  `node_modules` since it never resolves imports) — **0 syntax errors**
  anywhere in the repository, not just the files this phase touched.
- **Strict type-check**: `packages/types` (zero external dependencies,
  so a real `tsc -p tsconfig.json --noEmit` runs end-to-end here) —
  clean. Each app's `lib/itinerary.ts` + `lib/flight-types.ts` +
  `lib/format.ts` — the three files this phase's logic actually lives in
  — were also isolated and strict-type-checked directly (no framework
  types needed, since they have no React/Next/NestJS imports) — clean in
  all four apps.
- **Real build**: `packages/types` was actually compiled
  (`tsc -p tsconfig.json`, not just `--noEmit`) — succeeded, and the
  generated `dist/itinerary.d.ts` was inspected by hand to confirm the
  emitted declaration matches the source. `dist/` was removed afterward
  (it's gitignored — not meant to ship in source form).
- **Executed behavioral tests** (actually run, with real pass/fail
  assertions, not just read) against the real `groupSegmentsByLeg`
  implementation and each app's `legsFor`/`legLabel`/`routeSummary`:
  one-way nonstop, one-way with a connection, round trip both nonstop
  (the core bug — asserts NO false layover is reported across the
  outbound/return gap), round trip with a stop each way (asserts
  per-leg stats, no cross-leg contamination), a 3-leg multi-city
  itinerary, case-insensitive leg-boundary matching, and
  malformed/incomplete input (asserts it degrades gracefully rather
  than throwing). A separate test simulated the controller's exact
  Prisma-Date-object-to-ISO-string mapping with out-of-order segment
  sequences. A third replicated (copy-pasted verbatim, not retyped) the
  search page's `maxLegStops`/`bestScore`/stops-filter logic and
  asserted the stops-filter buckets are cumulative and the "Best" sort
  scores correctly. **62 assertions total, 0 failures.**
- `apps/b2b` and `apps/corporate`'s search-page filter/sort logic was
  confirmed **byte-identical** to the tested `apps/web` version (`diff`,
  not eyeballed), so the filter/sort assertions cover all three apps,
  not just one.

No bugs were found in this pass — the Phase 15 implementation held up
against every case tested. What this pass does NOT cover, disclosed
plainly: React/JSX-specific type errors (wrong prop types, hook misuse)
that only a real `tsc` run against the project's actual `react`/`next`
versions would catch, and anything in `apps/admin` (untouched this
phase, syntax-checked only as part of the whole-repo sweep). Before this
is trusted as production-ready, run the standard
`npm install && npm run typecheck && npm test` from the README on a
machine with network access.

## N. Deployment pipeline

```
Developer → Git (feature branch, PR + review)
    → CI (lint, typecheck, unit + integration tests, build)
    → Staging (auto-deploy on merge to main, seeded with mock data)
    → Manual promotion → Production
    → Monitoring (health checks, error tracking, metrics dashboards)
    → Automated backups (scheduled, retention policy, tested restore)
```

Environments (development / staging / production) are fully separated —
separate databases, separate credentials, separate supplier
sandbox-vs-live configuration. Production data is never used for testing
dangerous operations (bulk refunds, schema migrations, load tests).

## P. Risk register

| Risk | Category | Likelihood | Impact | Mitigation |
|---|---|:---:|:---:|---|
| Supplier API changes/downtime breaks search | Technical/Aviation | High | Medium | Adapter isolation, per-supplier timeout + circuit breaker, partial-failure-tolerant orchestrator |
| Fare changes between search and booking cause disputes | Aviation/Business | High | Medium | Mandatory reprice + explicit price-change confirmation before payment |
| Double-booking / duplicate charge from retried requests | Technical | Medium | High | Idempotency keys on booking/payment endpoints |
| Wallet balance drift / financial discrepancy | Financial | Medium | High | Append-only ledger, balance always re-derivable, reconciliation job |
| Payment gateway failure mid-flow | Payment | Medium | High | Payment state kept separate from booking state; webhook-driven reconciliation; manual recovery queue for stuck payments |
| Passport/PII data exposure | Security/Compliance | Low | Severe | Field-level encryption, PII-specific permission, signed short-lived document URLs, retention policy |
| Unauthorized/scraped supplier access | Legal/Compliance | Low | Severe | Hard policy: authorized interfaces only, enforced in code review and adapter onboarding checklist |
| Corporate policy engine incorrectly approves out-of-policy travel | Operational | Medium | Medium | Policy check is server-side and mandatory, not a frontend-only gate; audited |
| AI assistant fabricates live price/PNR/visa info | Product/Trust | Medium | High | Tool-use only for live data; explicit "requires verification" fallback when a tool call isn't possible |
| Multi-supplier duplicate detection merges materially different fares | Product | Medium | Medium | Conservative fingerprinting; merge only after multi-field comparison, never on flight-identity alone |
| Scaling a single relational DB under booking load | Technical | Low (near-term) | Medium | Proper indexing now, read replicas / sharding path identified for later, queue-based async work off the request path |

---

Ready to proceed to **Phase 1 — Foundation** on your go-ahead: real
repository scaffold, Postgres schema + first migrations, NestJS auth/RBAC
module, Next.js app shells for the four portals, Docker Compose for
local dev, and the mock supplier adapter interfaces — built and tested
incrementally, not dumped as one untested block.
