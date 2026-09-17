# MUHAMMAD TOURS AND TRAVELS — Operations, CI/CD & Disaster Recovery

Phase 10 of `ROADMAP.md`. This document is the "what's actually needed to
go live" companion to `ROADMAP.md`'s deployment-pipeline diagram and risk
register — concrete pipeline, concrete scripts, concrete checklists,
each labeled honestly as either **real and runnable today** or a
**placeholder for real infrastructure this repo cannot provide**.

## CI/CD pipeline

```
Developer → Git (feature branch, PR + review)
    → CI (.github/workflows/ci.yml — lint, typecheck, unit tests, build)
    → CD (.github/workflows/cd.yml, on merge to main):
        re-verify → build+push Docker images → auto-deploy staging
        → (manual, workflow_dispatch) → deploy production
    → Monitoring (infra/monitoring) + Automated backups (infra/scripts)
```

**Real and runnable today**: `ci.yml` (lint/typecheck/test/build — this
already existed before Phase 10 and needed no change), `cd.yml`'s
`verify` and `build-and-push` jobs (they build and push real Docker
images from `infra/docker/Dockerfile.api`/`Dockerfile.web` to GHCR,
using only the repo's own built-in `GITHUB_TOKEN` — no external secret
required to exercise this much of the pipeline).

**Placeholder, by necessity**: `cd.yml`'s `deploy-staging` and
`deploy-production` jobs. This project has no actual staging/production
infrastructure (no Kubernetes cluster, ECS service, or VM) for a real
`kubectl`/`helm`/`aws ecs`/SSH command to target — writing one that
*looks* real but points at nothing would be actively misleading. Each
job is a clearly labeled placeholder step plus a `GitHub Environment`
(`staging` / `production`) already wired up for approval gating and
per-environment secrets — replace only the placeholder `run:` step with
your real deploy command once real infrastructure exists; the trigger
logic, environment gating, and image tagging around it are meant to be
kept as-is.

**Production requires manual promotion, always.** `deploy-production`
only runs when someone manually dispatches the workflow with
`deploy_production: true` AND the run is approved against the
`production` GitHub Environment (configure required reviewers in repo
Settings → Environments — until that's configured, this gate does
nothing, so configuring it is a real prerequisite, not decoration).
Nothing pushes to production on a plain merge to `main`.

## Environments

Per `ROADMAP.md`'s own environments note: development, staging, and
production must stay fully separated — separate databases, separate
JWT/session secrets, separate supplier sandbox-vs-live configuration
(`AMADEUS_BASE_URL` pointed at Amadeus's test host in every environment
except a deliberately-configured production; `PAYMENT_PROVIDER_STRATEGY`
left at `MANUAL` anywhere real money must never move). Store each
environment's real values in that GitHub Environment's secrets/variables
(`STAGING_URL`/`PRODUCTION_URL` as variables; `DATABASE_URL` and every
credential as secrets) — never in this repo, per `SECURITY.md`'s secrets
management section, which this phase does not change.

## Monitoring & alerting

`apps/api`'s `GET /api/v1/metrics` (see `apps/api/src/modules/metrics`)
exposes Prometheus-format counters/histograms/gauges: HTTP request
count+duration by method/route/status, payment outcomes by
provider+status, current bookings/payments-by-status, and current
per-supplier health. `infra/monitoring/` wires a real Prometheus +
Alertmanager + Grafana stack around it:

```bash
docker compose -f docker-compose.yml -f infra/monitoring/docker-compose.monitoring.yml up
```

- `infra/monitoring/prometheus.yml` — scrape config, pointed at the
  `api` service's `/api/v1/metrics`.
- `infra/monitoring/alert-rules.yml` — alerts on API reachability, 5xx
  rate, p95 latency, supplier health, and payment failure rate.
- `infra/monitoring/alertmanager.yml` — routes those alerts; ships with
  **no real paging integration configured** (a safe, structurally valid
  default) — add your team's Slack/PagerDuty/email receiver before
  relying on this for real incident response.
- Grafana (`http://localhost:3009`, default placeholder credentials —
  change them) reads from the same Prometheus, for dashboards on top of
  the same series.

**Not yet done, honestly**: no dashboards are pre-built in Grafana (a
fresh install has the datasource but no saved dashboard JSON), and the
`HealthCheckDegraded` alert rule depends on a `blackbox_exporter`
target this repo does not configure — both are natural next steps, not
silently-assumed-working today. `GET /metrics` itself is **not** safe to
expose on the public internet as shipped (see its own doc comment) —
whatever fronts the API in staging/production must keep that specific
path internal-only.

## Load testing

See `infra/load-test/README.md`. Two scripts (a k6 script for real
capacity decisions, a zero-dependency Node fallback for a quick check)
against the search pipeline, both defaulting to this platform's mock
suppliers — **never point either at an environment with a real supplier
or `STRIPE` payment strategy active with production credentials.**
`cd.yml`'s `load-test-smoke` job runs the k6 script against staging, but
only on manual `workflow_dispatch` — never automatically, and never
against production.

## Backups & disaster recovery

**Mechanism (real, runnable today)**: `infra/scripts/backup-db.sh` takes
a `pg_dump -Fc` (custom format — restorable selectively, not just as one
monolithic replay) and prunes local copies past a retention window;
`infra/scripts/restore-db.sh` restores one back, requiring the operator
to type the target database's name as confirmation before it touches
anything (a restore overwrites data — the single most common DR mistake
is running it against the wrong `DATABASE_URL`).

```bash
DATABASE_URL=postgresql://... ./infra/scripts/backup-db.sh ./backups 14
DATABASE_URL=postgresql://... ./infra/scripts/restore-db.sh ./backups/mohammad-travels-<timestamp>.dump
```

**Schedule (placeholder, by necessity)**: these scripts are the
mechanism, not the schedule. Actually running `backup-db.sh` on a
recurring basis needs either (a) a cron entry on whatever host/container
runs it with network access to the production database, or (b) your
managed Postgres provider's own automated-snapshot feature (RDS
automated backups, Neon/Supabase/Cloud SQL point-in-time recovery,
etc.) — usually the better choice in practice, since it doesn't need
this repo's scripts at all. A GitHub Actions cron workflow was
deliberately **not** added for this: Actions runners have no network
path to a private production database in almost any real deployment,
and a workflow that only works when the database happens to be publicly
reachable would be a worse default than documenting the real choice
honestly.

**Recovery targets**: no production traffic has ever been served by this
platform (see `ROADMAP.md`'s phase status), so there is no real
incident history to derive RTO/RPO from. As a starting point pending a
real one: **RPO ≤ 24h** (daily backups, or your managed provider's
continuous point-in-time recovery, which does better than this) and
**RTO ≤ 4h** for a full restore drill. Revisit both once real traffic
and a real backup cadence exist.

### Restore drill checklist

Run this against staging — never rehearse a restore against production
data outside a declared incident:

1. Put the target environment into maintenance mode (stop routing user
   traffic to it) — a restore that runs while writes are still landing
   will lose them.
2. Confirm which backup file to restore (latest, or a specific
   point-in-time if recovering from a bad migration/bad data rather than
   infrastructure loss).
3. Run `restore-db.sh` against a **scratch database first**, not the
   real target, if there's any doubt about the backup's integrity.
4. Run `restore-db.sh` against the real target; confirm the typed
   database-name prompt matches before proceeding.
5. Run `npx prisma migrate status` (from `apps/api`) to confirm the
   restored schema's migration state matches what the currently-deployed
   API code expects — a backup taken before a since-applied migration
   needs that migration re-applied, not just a restore.
6. Smoke test `GET /api/v1/health` and a real search→book flow against a
   mock supplier before resuming traffic.
7. Write up what caused the restore and what (if anything) in this
   checklist didn't match reality — feed it back into this document.

### Staging → production promotion checklist

Mirrors `cd.yml`'s `deploy-production` gate — do this before ever
approving that run, not after:

1. `deploy-staging` succeeded and its smoke check passed for the exact
   commit being promoted.
2. Any pending Prisma migration for this release has been reviewed by a
   second person and dry-run against a copy of production-shaped data
   (never against production itself before this point).
3. A fresh backup of production exists and its restore has been drilled
   recently enough that you trust it (see above) — promotion is exactly
   when you most want a tested rollback path, not the moment to discover
   the backup script has silently been failing.
4. The specific env vars this release newly depends on are set in the
   `production` GitHub Environment (e.g. a new `AMADEUS_*`/`STRIPE_*`
   pair, `RATE_LIMIT_*` overrides) — `apps/api` fails fast on required
   config per `env.validation.ts`, but a newly-optional integration
   silently no-ops if forgotten rather than erroring, which is easy to
   miss.
5. Someone is actively watching `infra/monitoring`'s dashboards/alerts
   for the first 15–30 minutes after promotion, not just relying on
   alerting to page if something's wrong.
6. Rollback plan is explicit before you start: for this platform, that's
   re-running `deploy-production` with the previous commit's already-built
   image tag (`cd.yml` tags every image by `github.sha`, so the previous
   release's image never disappears) — confirm that tag before promoting
   forward, not while already mid-incident.

## What Phase 10 did not do

Kept in scope deliberately narrow, per this session's confirmed scope
("CI/CD pipeline, load testing, monitoring/alerting, disaster recovery —
what's actually needed to go live"): no real cloud infrastructure was
provisioned (there is none to provision against in this sandbox — see
`ROADMAP.md`'s repeated "no reachable npm registry / no live database"
notes, which extend to "no live cloud account" here), no dashboards were
pre-built in Grafana, and `HealthCheckDegraded`'s blackbox-exporter
dependency is not configured. Every placeholder above says so at the
point it appears, rather than presenting a deploy step that looks real
but silently does nothing.
