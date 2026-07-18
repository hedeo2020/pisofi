# Coolify isolated resources

Use this layout when you want PisoFi to look like separate Coolify resources instead of one combined Compose application.

## Resource 1: API application

- Type: Application
- Repository: `hedeo2020/pisofi`
- Branch: `main`
- Build pack: Dockerfile
- Dockerfile: `Dockerfile.api`
- Domain/FQDN: `https://api.3dbpoint.com`
- Port: `3000`

Environment variables:

```env
APP_MODE=simulation
SIMULATION_WEBHOOK_SECRET=<your Coolify secret>
PORT=3000
```

Health check:

```text
/healthz
```

## Resource 2: Customer portal application

- Type: Application
- Repository: `hedeo2020/pisofi`
- Branch: `main`
- Build pack: Dockerfile
- Dockerfile: `Dockerfile.portal`
- Domain/FQDN: `https://cpanel.3dbpoint.com`
- Port: `3000`

Environment variables:

```env
CUSTOMER_API_BASE_URL=https://api.3dbpoint.com
PORT=3000
```

Health check:

```text
/healthz
```

## Resource 3: PostgreSQL database

- Type: Database
- Engine: PostgreSQL
- Version: 17 if available, otherwise the latest Coolify-supported PostgreSQL
- Database name: `pisonet`
- Username: `pisonet`
- Password: use a generated Coolify secret
- Public port: disabled

Important: the current API is still simulation/in-memory and does not use PostgreSQL yet. Keep PostgreSQL isolated and ready for the next persistence slice.

## Optional resource 4: MQTT

Only add MQTT as a separate resource when we start using device message topics. Do not expose MQTT publicly until authentication and topic ACLs are implemented.

## Why this layout

- `api` and `portal` can have different domains.
- A bad portal deploy will not restart the API.
- Database lifecycle is separated from app image rebuilds.
- Coolify routing becomes simpler: each domain points to one app on port `3000`.
