# MOHAMMAD TRAVELS — Hostinger VPS production deployment

This release is designed for a Hostinger VPS with Docker available. The
production stack keeps PostgreSQL and Redis on the private Docker network and
exposes only HTTP/HTTPS through Caddy.

## 1. DNS

Create A records pointing to the VPS IP:

- `muhammadtravels.com`
- `www.muhammadtravels.com`
- `b2b.muhammadtravels.com`
- `corporate.muhammadtravels.com`
- `admin.muhammadtravels.com`
- `api.muhammadtravels.com`

If your real domain is different, replace the values in `.env.production`.

## 2. Install prerequisites on the VPS

Install Docker Engine + Compose plugin, Git (optional), and unzip. Keep
PostgreSQL/Redis ports private; do not open 5432/6379 in the Hostinger
firewall.

## 3. Upload the release

```bash
mkdir -p /opt/mohammad-travels
cd /opt/mohammad-travels
# upload/extract the release ZIP here
```

## 4. Production configuration

```bash
cp .env.production.example .env.production
nano .env.production
node scripts/deploy-check.mjs
```

Replace every placeholder. Generate unique long secrets, for example:

```bash
openssl rand -base64 48
openssl rand -base64 48
```

Use the first for `JWT_ACCESS_SECRET` and the second for
`JWT_REFRESH_SECRET`. Use a separate random password for PostgreSQL.

## 5. Build and start

```bash
npm run deploy:prod
```

Caddy obtains and renews TLS certificates automatically when DNS is correct
and ports 80/443 are reachable.

## 6. Database migration and reference data

Run migrations before relying on the new application version:

```bash
npm run deploy:migrate
npm run deploy:seed
```

`deploy:seed` creates the normal roles, permissions, bootstrap admin and
reference/supplier data. It does **not** create demo accounts.

For a staging/demo environment only:

```bash
npm run deploy:seed:demo
```

## 7. Verify

```bash
docker compose --env-file .env.production -f docker-compose.production.yml ps
curl -f https://api.muhammadtravels.com/api/v1/health
```

Expected health response has `status: "ok"` and both `database` and `redis`
marked `up`.

Then test:

- Public website: `https://muhammadtravels.com`
- B2B portal: `https://b2b.muhammadtravels.com`
- Corporate portal: `https://corporate.muhammadtravels.com`
- Admin console: `https://admin.muhammadtravels.com`
- API: `https://api.muhammadtravels.com/api/v1/health`

## 8. Updating the application

Back up PostgreSQL first, upload the new release, then:

```bash
node scripts/deploy-check.mjs
npm run deploy:migrate
npm run deploy:prod
```

The database migration is deliberately a separate command so schema changes
are visible and reviewable before the new application serves traffic.

## 9. Backups

At minimum, schedule encrypted PostgreSQL dumps to storage outside the VPS.
Also keep a copy of the `.env.production` secrets in an enterprise password
manager or secrets vault. Never commit production secrets to Git.

Example manual backup:

```bash
docker compose --env-file .env.production -f docker-compose.production.yml exec -T postgres \
  pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" | gzip > backup-$(date +%F-%H%M).sql.gz
```

## 10. Real supplier/payment integrations

The release remains safe in manual/mock mode until real credentials are
provided. For live integrations, enable only after supplier/payment
contractual approval, sandbox testing, reconciliation tests and operational
monitoring are complete.

- Amadeus: set `AMADEUS_API_KEY`, `AMADEUS_API_SECRET` and the production base URL.
- Stripe: set `STRIPE_SECRET_KEY` and `PAYMENT_PROVIDER_STRATEGY=STRIPE`.
- WhatsApp Cloud API: set the Meta credentials and
  `WHATSAPP_PROVIDER_STRATEGY=META`.
- AI: set `ANTHROPIC_API_KEY` only after reviewing data-retention and privacy
  requirements for the prompts being sent.
