# Load testing

Two scripts, same target (`POST /flights/search`, plus `GET /airports/search`
in the k6 version), for different situations:

| Script | Use when |
|---|---|
| `k6-flight-search.js` | You can install [k6](https://grafana.com/docs/k6/latest/set-up/install-k6/) (a standalone binary, no npm involved). This is the one to use for a real go/no-go launch decision — ramping virtual users, proper percentile thresholds, scenario mix. |
| `simple-load-test.mjs` | You can't install anything new. Pure Node 20+ (`fetch` + a fixed worker pool), no dependencies at all — runs with the same Node binary this monorepo already requires. Cruder: fixed concurrency, one route, no ramp. Good for a quick gut check, not a launch decision. |

## Running

```bash
# k6 (preferred)
k6 run infra/load-test/k6-flight-search.js
k6 run -e BASE_URL=https://staging.example.com/api/v1 --vus 50 --duration 5m infra/load-test/k6-flight-search.js

# Zero-dependency fallback
node infra/load-test/simple-load-test.mjs http://localhost:4000/api/v1 20 500
```

## What this does and does not tell you

Both scripts hit the platform's mock supplier adapters (`MOCK_SUPPLIER_A`
through `E`, seeded active by default — see `database/seeds/data/suppliers.ts`)
unless you've deliberately activated a real supplier. That's the right
default: a load test that fans out to a real GDS/NDC API or a real payment
gateway would generate genuine cost and possibly genuine side effects (see
`apps/api/src/modules/suppliers/adapters/real/amadeus-flight-supplier.adapter.ts`'s
own doc comment). **Never point either script at an environment where a real
supplier or `STRIPE` payment strategy is active with production credentials.**

Because of that, these numbers characterize this platform's own code path —
routing, validation, the search orchestrator's fan-out/normalization/pricing,
Postgres/Redis under load — not a real airline's API latency, which will
usually dominate in production. Re-run against a real supplier's sandbox
environment (never production credentials) before trusting these numbers for
real capacity planning.

## Thresholds

The thresholds baked into `k6-flight-search.js` (`http_req_failed < 1%`,
`p95 flight_search_duration < 3s`) are first guesses, not a validated SLO —
this platform has never served real production traffic to calibrate against
(see `docs/OPERATIONS.md`). Treat a failing threshold as "investigate,"
tighten or loosen the number once you have a real traffic baseline, and wire
CI to run a short k6 smoke test on a schedule once there's a staging
environment worth protecting (see `.github/workflows/cd.yml`'s
`load-test-smoke` job, currently `workflow_dispatch`-only for exactly that
reason).

## Interpreting failures against the metrics/alerting stack

Both scripts' failures should show up as `HighHTTP5xxRate` or `SlowRequests`
in `infra/monitoring/alert-rules.yml` if you run them against an environment
with the monitoring stack (`infra/monitoring/docker-compose.monitoring.yml`)
attached — that's a good way to sanity-check the alerting rules themselves
actually fire before you need them to.
