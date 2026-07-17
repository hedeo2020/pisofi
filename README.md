# PisoNet clean-room simulator

This repository is the safe starting point for an LPB-style captive-portal platform. It currently implements an in-memory simulation only; it is not ready for real payments or production clients.

## Run the verified simulation

```powershell
node --test
node apps/simulator/src/main.js
```

The simulation creates a tenant and virtual Orange Pi, records idempotent coin pulses, issues and redeems a voucher, then simulates signed successful GCash, Maya, and QRPh callbacks. Each digital payment produces exactly one voucher.

## Local Docker stack

1. Copy `.env.example` to `.env` and replace the database password.
2. Run `docker compose up --build`.
3. Check `http://127.0.0.1:3000/healthz`.

PostgreSQL and MQTT are present to validate infrastructure wiring. The schema includes tenant users/RBAC, devices, event idempotency, an append-only credit ledger, payment intents/events, vouchers, and sessions. The API deliberately refuses `APP_MODE=production` until its durable PostgreSQL repository, tenant authentication, nonce replay store, real payment provider, and MQTT authorization are implemented and tested.

## Coolify simulation

Deploy this repository as a Docker Compose resource. Set `POSTGRES_PASSWORD` as a Coolify secret. Route a temporary HTTPS hostname only to the `api` service on port 3000. Do not publish PostgreSQL or MQTT publicly. Keep `APP_MODE=simulation` and use disposable data.

## Production gates

- PostgreSQL-backed atomic ledger, payment webhook processing, and voucher redemption
- Admin authentication, tenant isolation, RBAC, CSRF, and rate limiting
- Per-device enrollment and HMAC replay prevention
- Authenticated MQTT with per-device topic ACLs and TLS
- Orange Pi offline cache and nftables/GPIO adapters
- Portal/admin UI and browser E2E coverage
- Backups, observability, load tests, and security review

See [docs/architecture.md](docs/architecture.md) for the deployment boundary.
