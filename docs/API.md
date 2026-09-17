# MUHAMMAD TOURS AND TRAVELS — API Architecture

Style: REST, versioned (`/api/v1/...`), documented with OpenAPI 3.x
(generated from NestJS decorators, served at `/api/v1/docs`). Every
endpoint sits behind an auth guard and a permission guard (see
`SECURITY.md`); public endpoints (search, content) are the explicit
exception, not the default.

## Conventions

- **Correlation ID**: every request carries/receives `X-Request-Id`,
  propagated through supplier calls and into logs.
- **Idempotency**: booking creation and payment confirmation endpoints
  require an `Idempotency-Key` header. A retried request with the same
  key returns the original result rather than creating a duplicate
  booking/charge — critical for a system doing parallel supplier calls
  under network-unreliable conditions.
- **Errors**: a single error envelope (`code`, `message`, `details`,
  `requestId`) — never raw stack traces or supplier error payloads
  passed straight through to the client.
- **Pagination**: cursor-based on list endpoints (`bookings`, `tickets`,
  `crm_records`, `audit_logs`) — offset pagination breaks under
  concurrent writes on these tables.

## Modules

**`/api/v1/auth`** — login, register, refresh, logout, MFA challenge
(architecture-ready, see `SECURITY.md`), password reset.

**`/api/v1/users`** — profile, role assignment (admin-scoped).

**`/api/v1/searches`** — `POST /searches` (kicks off the orchestrator —
see `SUPPLIER-INTEGRATION.md`), `GET /searches/:id/offers` (poll or
WebSocket-subscribe for results as suppliers respond).

**`/api/v1/offers`** — `GET /offers/:id`, `POST /offers/:id/reprice`
(mandatory step before booking — offers are not bookable directly).

**`/api/v1/bookings`** — `POST /bookings` (idempotent), `GET
/bookings/:id`, `POST /bookings/:id/passengers`, state-transition
sub-resources for cancel/void.

**`/api/v1/pnr`** — `GET /pnr/:id`, `GET /pnr/:id/status` (live status
check against supplier, never cached as "current").

**`/api/v1/tickets`** — `POST /tickets/issue`, `GET /tickets/:id`, `GET
/tickets/:id/document` (e-ticket PDF).

**`/api/v1/payments`** — `POST /payments/intent`, `POST
/payments/confirm` (idempotent), provider webhooks under
`/payments/webhooks/:provider`.

**`/api/v1/refunds`** / **`/api/v1/reissues`** — request, admin/agent
review, status.

**`/api/v1/b2b`** — agent registration, approval (admin), wallet, credit,
commission, statements.

**`/api/v1/corporate`** — company/department/employee CRUD, policy
config, approval queue.

**`/api/v1/hotels`** — search, offer detail, booking (mirrors the flight
flow at a smaller scale — no reprice step for most hotel suppliers, but
the interface leaves room for one).

**`/api/v1/visa`** — application CRUD, document upload, status.

**`/api/v1/packages`** — package CRUD (staff-authored), package booking.

**`/api/v1/crm`** — leads, tasks, communication history.

**`/api/v1/notifications`** — templates (admin), delivery log (read).

**`/api/v1/admin`** — supplier config & health, pricing/markup rules,
audit log read access, system settings. Every write here is audited.

## Search → book → ticket, as an API sequence

```
POST /api/v1/searches                → { searchId }
GET  /api/v1/searches/:id/offers     → offers stream in as suppliers respond
POST /api/v1/offers/:offerId/reprice → { priceConfirmed | priceChanged: {old,new} }
POST /api/v1/bookings                → { bookingId, status: PASSENGER_DETAILS }
POST /api/v1/bookings/:id/passengers → { status: PAYMENT_PENDING }
POST /api/v1/payments/intent         → { clientSecret / redirectUrl }
POST /api/v1/payments/confirm        → { status: BOOKING_PENDING }
                                         (async) → BOOKED → TICKETING_PENDING → TICKETED
GET  /api/v1/bookings/:id            → poll or subscribe via WebSocket for final state
```

Full request/response schemas live in the generated OpenAPI spec, not
duplicated here, so this document doesn't drift out of sync with the
actual contract.
