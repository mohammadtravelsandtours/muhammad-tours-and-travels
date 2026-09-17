# MOHAMMAD TRAVELS — Demo accounts

These accounts are for staging, acceptance testing and demonstrations. The
`db:seed:demo` command is intentionally separate from the normal production
seed so demo credentials are never created accidentally.

**Shared demo password:** `DemoPass123!`

| Area | Login | Password | Purpose |
|---|---|---|---|
| Admin | `admin@mohammadtravels.example` | `ChangeMe123!Now` | Full platform administration (created by normal seed) |
| Operations | `ops@demo.mohammadtravels.example` | `DemoPass123!` | Ops/support workflows |
| Finance | `finance@demo.mohammadtravels.example` | `DemoPass123!` | Finance, wallet, pricing and refund workflows |
| B2B Agency Admin | `agent@demo.mohammadtravels.example` | `DemoPass123!` | Active demo agency + funded wallet |
| B2B Agent | `b2bagent@demo.mohammadtravels.example` | `DemoPass123!` | Agent-level search and booking |
| B2C Customer | `customer@demo.mohammadtravels.example` | `DemoPass123!` | Customer flight/hotel/visa journeys |
| Corporate Employee | `employee@demo.mohammadtravels.example` | `DemoPass123!` | Corporate booking + policy workflow |
| Corporate Approver | `approver@demo.mohammadtravels.example` | `DemoPass123!` | Corporate approval queue |

## Create demo data

After migrations and normal reference/supplier seeds:

```bash
SEED_DEMO_PASSWORD='DemoPass123!' npm run db:seed:demo
```

On the production Docker deployment:

```bash
npm run deploy:seed:demo
```

Do **not** publish these credentials on a live public website. Change or delete
all demo accounts before handing production access to customers or staff.
