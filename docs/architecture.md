# Clean-room PisoNet architecture

## First simulation journey

1. A kiosk is provisioned with a unique device ID and device secret.
2. The kiosk signs each event with HMAC-SHA256 and a timestamp/nonce.
3. Coin pulses are converted to credit through a station-owned rate plan.
4. Credit is exchanged for a voucher or attached directly to a client session.
5. A redeemed voucher starts one active session for a client MAC address.
6. Heartbeats update device and session liveness; expiration is calculated by the server.

## Multi-tenant and payment model

- Every owner is a tenant; every station, payment, voucher, session, ledger entry, and device event carries a tenant ID.
- Roles are owner, admin, operator, and viewer. Database row-level security is enabled as defense in depth.
- Coin pulses enter an append-only credit ledger and use a device/event idempotency key.
- GCash, Maya, and QRPh share a payment-intent state machine but retain provider-specific metadata.
- Browser redirects never grant access. Only a verified provider webhook or authenticated provider-status lookup can move an intent to `paid`.
- Provider event IDs and payment IDs are unique, so retries cannot issue multiple vouchers.
- QRPh payloads are dynamic and tied to one payment intent; the provider controls their expiration.

## Deployment boundary

- Coolify: API, worker, PostgreSQL, Redis, MQTT broker, admin web application.
- Orange Pi: outbound-only agent, captive portal, local fail-safe cache, nftables and GPIO adapters.
- Simulator: replaces GPIO, network clients, and the Orange Pi agent before ARM compilation.

No production device accepts unsolicited internet connections. Secrets are unique per device and stored only as hashes/server-side secret material.
