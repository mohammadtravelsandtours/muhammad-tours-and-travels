# apps/mobile — Muhammad Tours and Travels (React Native / Expo)

Phase 7 of `docs/ROADMAP.md`: the B2C flight flow (search → results → fare
detail → book → confirmation → manage) as a native iOS/Android app, built
against the same `apps/api` backend as `apps/web`.

## Stack

- Expo SDK 51 (managed workflow) + TypeScript
- React Navigation (`@react-navigation/native`, `native-stack`, `bottom-tabs`)
- `@react-native-async-storage/async-storage` for the session token (the
  mobile equivalent of `apps/web`'s `sessionStorage`)
- `@react-native-community/datetimepicker` for date entry
- No Redux/MobX/query library — the same lightweight `useState` + a small
  `AuthProvider` context pattern `apps/web`/`apps/admin` already use, kept
  consistent on purpose

## Structure

```
App.tsx                      — providers + navigation root
index.ts                     — Expo entry point
src/
  lib/
    api-client.ts             — same request()/ApiError contract as apps/web's client
    flight-types.ts           — same DTO shapes as apps/web's (duplicated, not shared — see file header)
    auth-context.tsx          — AsyncStorage-backed session (vs. sessionStorage on web)
    storage.ts                — thin AsyncStorage wrapper
    format.ts                 — identical formatters to apps/web
    manage-booking-airlines.ts — identical dataset to apps/web
  navigation/
    types.ts                  — typed param lists for every stack/tab
    nav-ref.ts                — global nav ref so any screen can open the Login/Register modal
    RootNavigator.tsx          — bottom tabs (Search / My Trips / Manage / Account) + root modal stack
  screens/                    — one screen per apps/web page it mirrors
  components/                 — AirportInput, OfferCard, DateField, form primitives
  theme/colors.ts             — mirrors apps/web's Tailwind palette (dusk/sand/tangerine/ground)
```

## Screens ↔ apps/web pages

| Mobile screen | Mirrors (apps/web) |
|---|---|
| `SearchScreen` | `/search` + `FlightSearchForm` |
| `SearchResultsScreen` | `/search/[searchId]` |
| `OfferDetailScreen` | `/offers/[offerId]` |
| `BookingScreen` | `/offers/[offerId]/book` |
| `BookingDetailScreen` | `/bookings/[id]` — **plus a Cancel action** apps/web doesn't currently surface in its UI (exercises the `POST /bookings/:id/cancel` endpoint built in an earlier phase) |
| `MyTripsScreen` | `/bookings` |
| `ManageBookingScreen` | `/manage-booking` |
| `LoginScreen` / `RegisterScreen` | `/login` / `/register` — presented as modals from anywhere via `navigation/nav-ref.ts`, rather than a route redirect |
| `AccountScreen` | `/account` |

Auth gating works differently from the web app on purpose: instead of a
redirect-on-mount to `/login?next=...`, a screen that needs a signed-in
traveler renders `<SignInRequired />` inline, whose buttons open the
Login/Register modal; on success the modal just dismisses and the
underlying screen re-renders because it reads `user` from `useAuth()`.
This avoids threading a serializable "return to" route through React
Navigation's typed params.

## Running this

**Not runnable in the sandbox this was built in** — no `node_modules`
exist anywhere in this monorepo and the npm registry isn't reachable from
here (see the repo-root `docs/ROADMAP.md` engineering notes), so this was
never `npm install`ed, `expo start`ed, or opened in a simulator. Every
file was hand-written to be a complete, real Expo/TypeScript source tree
and checked for syntax errors and unresolved internal (`@/...` and
relative) imports with the same esbuild-based scripts used to verify the
rest of this repo — but the Metro bundler, Expo Go, and the native builds
themselves have not actually run.

To actually run it once dependencies can be installed:

```bash
cd apps/mobile
npm install
npm start          # then press i for iOS simulator, a for Android emulator, or scan the QR code in Expo Go
```

Point it at a real API by setting `EXPO_PUBLIC_API_URL` (see
`src/lib/api-client.ts`) or editing `app.json`'s `expo.extra.apiUrl` — it
defaults to `http://localhost:4000/api/v1`, which only resolves from a
simulator on the same machine as the API, not a physical device on Wi-Fi.
