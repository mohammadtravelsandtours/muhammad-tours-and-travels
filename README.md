# MUHAMMAD TOURS AND TRAVELS — GitHub Pages Frontend

This repository contains the GitHub Pages-ready frontend homepage for **MUHAMMAD TOURS AND TRAVELS**.

## Deploy on GitHub Pages

1. Create a GitHub repository.
2. Upload `index.html` to the repository root.
3. Open **Settings → Pages**.
4. Select **Deploy from a branch**.
5. Select the `main` branch and `/ (root)`.
6. Save.

## Important production note

This frontend intentionally does **not** fabricate flight fares, hotel availability, PNRs, ticket numbers, payment confirmations, or user authentication.

For live booking, connect it to the existing NestJS API, PostgreSQL, Redis, supplier adapters, payment verification, and Google Sheets synchronization in the full Mohammad Travels monorepo.

Required production flow:

B2C/B2B search → secure API → supplier adapters → normalized offers → price revalidation → passenger details → mobile wallet/bank transfer → receipt upload → admin approval → supplier booking/ticketing → real PNR/ticket → notifications.

## Brand

MUHAMMAD TOURS AND TRAVELS
