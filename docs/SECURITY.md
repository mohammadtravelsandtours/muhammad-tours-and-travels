# MUHAMMAD TOURS AND TRAVELS — Security Architecture

## M. Authentication

- Passwords hashed with Argon2id (memory-hard, current best practice —
  not bcrypt/md5).
- Session model: short-lived JWT access token + long-lived, rotating
  refresh token stored server-side (revocable). Refresh tokens are
  per-device so a stolen device's session can be revoked without logging
  the user out everywhere.
- MFA-ready: schema and login flow have a `mfaRequired` challenge step
  wired in from day one (TOTP first), even though it's not enforced in
  Phase 1.
- Rate limiting on login/password-reset/OTP endpoints; exponential
  lockout after repeated failures, not a hard permanent lock (avoids a
  cheap denial-of-service against a specific account).
- Every portal (B2C, B2B, Corporate, Admin) issues tokens scoped to that
  portal only — a B2C customer token is structurally incapable of calling
  admin or B2B endpoints, independent of the permission check (defense in
  depth).

## J. Authorization — RBAC permission matrix

Roles are assigned per user; permissions are resource-action pairs
evaluated by a guard on every request, not trusted from the JWT alone
(the JWT carries role, the guard re-checks current permissions so a
revoked permission takes effect immediately, not at next token refresh).

| Resource / Action | B2C Customer | B2B Agent | B2B Agency Admin | Corporate Employee | Corporate Approver | Ops/Support | Finance | Super Admin |
|---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| Search flights/hotels | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | – | ✅ |
| Book (own) | ✅ | ✅ | ✅ | submit for approval | ✅ | – | – | ✅ |
| View own bookings | ✅ | ✅ | agency-wide | ✅ | dept-wide | ✅ | ✅ | ✅ |
| Approve corporate booking | – | – | – | – | ✅ | – | – | ✅ |
| Issue/void ticket | – | ✅ (own) | ✅ (agency) | – | – | ✅ | – | ✅ |
| Process refund/reissue | request only | request/approve small | ✅ | request only | – | ✅ | ✅ | ✅ |
| Adjust wallet/credit | – | view own | view own | – | – | – | ✅ | ✅ |
| View ledger/statements | – | own | agency | – | dept budget | – | ✅ | ✅ |
| Configure pricing/markup | – | – | – | – | – | – | ✅ | ✅ |
| Configure suppliers | – | – | – | – | – | – | – | ✅ |
| Manage users/roles | – | – | agency staff | – | – | – | – | ✅ |
| View audit logs | – | – | – | – | – | limited | financial only | ✅ |

This is the Phase-0 baseline matrix; it expands as hotel/visa/package
modules add their own resources, following the same pattern (never a new
ad-hoc permission style).

## Secrets management

- No API keys, DB credentials, or provider secrets in frontend bundles or
  source control, ever — enforced by a pre-commit secret scanner and CI
  check, not just policy.
- Secrets injected via environment variables per environment
  (development/staging/production), sourced from a secrets manager in
  staging/production (not `.env` files on disk in those environments).
- `.env.example` documents every required variable with no real values.

## Data protection (passenger PII)

- Data minimization: only fields required for the specific transaction
  are collected (e.g. passport number/expiry only when the fare/route
  requires it).
- Encryption in transit (TLS everywhere) and at rest (encrypted storage
  for the `passengers` table's sensitive columns and for documents in
  object storage).
- Passport scans and visa documents live in S3-compatible storage behind
  signed, short-lived URLs — never served as public objects.
- Access to passenger PII is itself a permission (`passengers:read:pii`),
  separate from general booking read access, so a support agent can see
  a booking's status without seeing a passport number unless that's
  actually needed.
- Retention: passenger PII tied to a booking is retained per the
  regulatory/contractual minimum for travel records, then purged or
  anonymized on a scheduled job — not kept indefinitely by default.

## Application security baseline

Input validation at the DTO layer (class-validator on every NestJS
controller), parameterized queries only (no raw SQL string
concatenation), output encoding on anything rendered to the DOM (XSS),
CSRF protection on cookie-based flows, standard secure headers (HSTS,
CSP, X-Content-Type-Options, etc.) applied at the Nginx layer.

## Audit logging

Every sensitive administrative action writes to `audit_logs`:
who (`user_id`), what (`action`, `resource`, `resource_id`), when
(`timestamp`), old value, new value, and IP/device where available.
Explicitly audited: pricing/markup changes, wallet adjustments, refunds,
ticketing actions, permission/role changes, supplier configuration
changes, booking modifications made by staff on a customer's behalf.
Audit logs are append-only and not editable through any application
role, including Super Admin (deletion, if ever required for legal
reasons, happens at the database level with its own separate audit
trail).
