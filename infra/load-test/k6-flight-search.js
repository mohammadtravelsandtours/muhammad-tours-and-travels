// k6 load test — exercises the two unauthenticated, highest-traffic
// endpoints a real launch would see the most volume on: airport
// autocomplete (GET /airports/search) and the flight search pipeline
// itself (POST /flights/search, then GET /flights/search/:id to read
// results back — mirrors how apps/web's search page actually calls the
// API, see apps/web/src/app/search/[searchId]/page.tsx).
//
// k6 (https://k6.io) is a standalone Go binary with an embedded JS
// runtime — it is NOT an npm package, so it needs no `npm install` in
// this repo (this sandbox has no reachable npm registry — see every
// other Phase 9/10 file's own note on that constraint). Install it
// separately: https://grafana.com/docs/k6/latest/set-up/install-k6/
//
// Run:
//   k6 run infra/load-test/k6-flight-search.js
//   k6 run -e BASE_URL=https://staging.example.com/api/v1 --vus 50 --duration 5m infra/load-test/k6-flight-search.js
//
// NEVER point this at a production URL with real supplier credentials
// configured — a load test that actually reaches a live GDS/NDC
// supplier (see apps/api/src/modules/suppliers/adapters/real) or a live
// Stripe key would generate real cost and possibly real side effects.
// This repeatedly hits mock suppliers by default, which is exactly what
// a load test against this platform should do.
import http from 'k6/http';
import { check, sleep } from 'k6';
import { Trend } from 'k6/metrics';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:4000/api/v1';

const searchDuration = new Trend('flight_search_duration', true);

export const options = {
  scenarios: {
    steady_load: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '30s', target: 20 }, // ramp up
        { duration: '2m', target: 20 }, // hold
        { duration: '30s', target: 0 }, // ramp down
      ],
    },
  },
  thresholds: {
    // Starting targets, not a validated SLO — see this directory's
    // README for why these numbers are first guesses.
    http_req_failed: ['rate<0.01'],
    flight_search_duration: ['p(95)<3000'],
  },
};

// A small fixed pool of routes actually seeded by database/seeds — a
// load test against random/invalid IATA codes would mostly measure
// "how fast does this platform say zero results," not real search cost.
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

export default function () {
  const route = ROUTES[Math.floor(Math.random() * ROUTES.length)];

  // 1. Airport autocomplete, as a real user types.
  const autocompleteRes = http.get(`${BASE_URL}/airports/search?q=${route.origin.slice(0, 2)}`);
  check(autocompleteRes, { 'airport search 200': (r) => r.status === 200 });

  // 2. Kick off a flight search.
  const searchPayload = JSON.stringify({
    tripType: 'ONE_WAY',
    cabin: 'ECONOMY',
    adults: 1,
    children: 0,
    infants: 0,
    currency: 'USD',
    segments: [{ origin: route.origin, destination: route.destination, departureDate: futureDateString(30) }],
  });
  const searchStart = Date.now();
  const searchRes = http.post(`${BASE_URL}/flights/search`, searchPayload, {
    headers: { 'Content-Type': 'application/json' },
  });
  const searchOk = check(searchRes, { 'flight search 201/200': (r) => r.status === 200 || r.status === 201 });

  if (searchOk) {
    const searchId = JSON.parse(searchRes.body).id ?? JSON.parse(searchRes.body).searchId;
    if (searchId) {
      // 3. Poll the search result once, like the frontend's results page does.
      const resultRes = http.get(`${BASE_URL}/flights/search/${searchId}`);
      check(resultRes, { 'flight search result 200': (r) => r.status === 200 });
    }
  }
  searchDuration.add(Date.now() - searchStart);

  sleep(1); // a human pauses between actions — an unthrottled tight loop measures nothing realistic
}
