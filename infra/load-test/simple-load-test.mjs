#!/usr/bin/env node
/**
 * Zero-dependency fallback load test — for anywhere k6 isn't installed
 * (see k6-flight-search.js for the primary, more capable tool). Uses
 * only Node's built-in `fetch` (Node 20+, matching this repo's own
 * engines.node requirement — see root package.json) and
 * `node:worker_threads`, so it runs with nothing beyond the Node
 * binary already required to run this monorepo — no `npm install`
 * needed, which matters in a sandbox with no reachable npm registry
 * (the same constraint noted throughout apps/api's Phase 9 changes).
 *
 * This is deliberately much cruder than k6: fixed concurrency, no
 * ramping stages, no scripted scenario mix. Use it for a quick
 * "did I just break latency" gut check in an environment where
 * installing k6 isn't an option; use k6 for anything you'll actually
 * make a go/no-go launch decision on.
 *
 * Usage:
 *   node infra/load-test/simple-load-test.mjs [baseUrl] [concurrency] [totalRequests]
 *   node infra/load-test/simple-load-test.mjs http://localhost:4000/api/v1 20 500
 */

const baseUrl = process.argv[2] || 'http://localhost:4000/api/v1';
const concurrency = parseInt(process.argv[3] || '10', 10);
const totalRequests = parseInt(process.argv[4] || '200', 10);

const ROUTES = [
  { origin: 'JFK', destination: 'LAX' },
  { origin: 'LHR', destination: 'DXB' },
  { origin: 'SIN', destination: 'BKK' },
];

function futureDateString(daysAhead) {
  const d = new Date();
  d.setDate(d.getDate() + daysAhead);
  return d.toISOString().slice(0, 10);
}

async function oneRequest() {
  const route = ROUTES[Math.floor(Math.random() * ROUTES.length)];
  const start = performance.now();
  let ok = false;
  let status = 0;
  try {
    const res = await fetch(`${baseUrl}/flights/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tripType: 'ONE_WAY',
        cabin: 'ECONOMY',
        adults: 1,
        children: 0,
        infants: 0,
        currency: 'USD',
        segments: [{ origin: route.origin, destination: route.destination, departureDate: futureDateString(30) }],
      }),
    });
    status = res.status;
    ok = res.ok;
    await res.text(); // drain the body so the connection is actually freed
  } catch {
    ok = false;
  }
  return { ok, status, durationMs: performance.now() - start };
}

async function worker(remainingCounter, results) {
  while (remainingCounter.value > 0) {
    remainingCounter.value--;
    results.push(await oneRequest());
  }
}

async function main() {
  console.log(`Load testing ${baseUrl}/flights/search — ${totalRequests} requests at concurrency ${concurrency}`);
  const remainingCounter = { value: totalRequests };
  const results = [];
  const workers = Array.from({ length: concurrency }, () => worker(remainingCounter, results));
  const overallStart = performance.now();
  await Promise.all(workers);
  const overallDurationS = (performance.now() - overallStart) / 1000;

  const durations = results.map((r) => r.durationMs).sort((a, b) => a - b);
  const percentile = (p) => durations[Math.min(durations.length - 1, Math.floor((p / 100) * durations.length))];
  const failed = results.filter((r) => !r.ok);

  console.log('');
  console.log(`Total requests:     ${results.length}`);
  console.log(`Wall-clock time:    ${overallDurationS.toFixed(1)}s`);
  console.log(`Throughput:         ${(results.length / overallDurationS).toFixed(1)} req/s`);
  console.log(`Failed:             ${failed.length} (${((failed.length / results.length) * 100).toFixed(1)}%)`);
  console.log(`Latency p50/p95/p99: ${percentile(50).toFixed(0)}ms / ${percentile(95).toFixed(0)}ms / ${percentile(99).toFixed(0)}ms`);

  if (failed.length > 0) {
    const statusCounts = {};
    for (const f of failed) statusCounts[f.status] = (statusCounts[f.status] ?? 0) + 1;
    console.log(`Failure status codes: ${JSON.stringify(statusCounts)}`);
  }
}

main();
