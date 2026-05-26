# AfiaCare Backend

Unified maternal-health backend for AfiaCare (Ghana). ONE Express API serving
three channels — **web** (REST/JSON), **USSD** (`*928#`), and **Voice/IVR** —
over shared services and a single PostgreSQL database.

The architectural contract is in [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md);
build conventions are in [`CLAUDE.md`](CLAUDE.md). Read those before touching
anything substantial. The short version: **business logic lives in
`services/`; controllers only translate** between channel-specific request
formats and shared service calls.

## Stack

| Layer            | Choice                              |
|------------------|-------------------------------------|
| Runtime          | Node 20 + TypeScript (strict)       |
| HTTP             | Express 4                           |
| ORM / DB         | Prisma 5 + PostgreSQL 14+           |
| Auth (web)       | JWT (HS256) + bcrypt                |
| Auth (USSD/voice)| Phone number is the identity        |
| Validation       | zod at every controller boundary    |
| Risk classifier  | Rule-based, deterministic           |
| USSD / Voice     | Africa's Talking (simulators local) |
| SMS              | Simulated in Phase 1 (logged + DB)  |

## Setup

```bash
# 1. Install dependencies
npm install

# 2. Postgres — anything running on localhost:5432 works. Quick options:
#    macOS:   brew services start postgresql@14 && createdb afiacare
#    Linux:   sudo systemctl start postgresql && sudo -u postgres createdb afiacare
#    Docker:  docker run --name afiacare-pg -e POSTGRES_PASSWORD=postgres \
#                        -e POSTGRES_DB=afiacare -p 5432:5432 -d postgres:14

# 3. Environment
cp .env.example .env
# Edit .env:
#   - DATABASE_URL must point at your running Postgres
#   - JWT_SECRET must be at least 32 characters
#   - ESCALATION_CHW_PHONES is comma-separated; leave empty in dev unless
#     you want to see the simulated SMS log fill up

# 4. Database
npm run prisma:migrate -- --name init    # creates schema, applies it
npm run db:seed                          # inserts CHW + DHO + ADMIN demo users

# 5. Run
npm run dev                              # tsx watch — restarts on save
```

The seeded staff accounts (password for all three: `afiacare-demo`):

| Role  | Email                  | Phone            |
|-------|------------------------|------------------|
| CHW   | `chw@afiacare.demo`    | `+233244000001`  |
| DHO   | `dho@afiacare.demo`    | `+233244000002`  |
| ADMIN | `admin@afiacare.demo`  | `+233244000003`  |

## Scripts

```bash
npm run dev              # local dev server (tsx watch)
npm run build            # tsc -> dist/
npm start                # run built server
npm run typecheck        # tsc --noEmit, no output
npm run prisma:migrate   # prisma migrate dev
npm run prisma:generate  # regenerate the client after schema edits
npm run prisma:studio    # GUI to inspect the DB
npm run db:seed          # seed staff users
```

## Demo walkthrough

Two local tools live in `public/` and are served by Express:

- **USSD simulator** — `http://localhost:4000/ussd-simulator.html`
- **CHW dashboard** — `http://localhost:4000/dashboard.html`

The five-step demo:

1. **Login as the seeded CHW** to get a JWT, paste into the dashboard.
   ```bash
   curl -sS -X POST http://localhost:4000/api/auth/login \
     -H 'Content-Type: application/json' \
     -d '{"email":"chw@afiacare.demo","password":"afiacare-demo"}' | jq -r .token
   ```
   Open `http://localhost:4000/dashboard.html`, paste the token, click **Load**.
   Empty state — no alerts yet.

2. **Register a patient via the web API** (simulating the Next.js frontend):
   ```bash
   curl -sS -X POST http://localhost:4000/api/auth/register \
     -H 'Content-Type: application/json' \
     -d '{"email":"asha@example.com","password":"testpass123","fullName":"Asha","phone":"+233244999000"}' | jq
   ```

3. **Trigger an EMERGENCY** via the patient's token (from step 2's response):
   ```bash
   curl -sS -X POST http://localhost:4000/api/risk/check \
     -H "Authorization: Bearer <patient-token>" \
     -H 'Content-Type: application/json' \
     -d '{"symptoms":{"convulsions":true}}' | jq
   ```
   Returns `level: "EMERGENCY"` + recommendation. **Refresh the dashboard** —
   one OPEN EMERGENCY alert + (if `ESCALATION_CHW_PHONES` is set) one
   SENT notification. The dev server console also logs the simulated SMS.

4. **Trigger the same case via USSD**, demonstrating cross-channel
   reconciliation. Open the simulator, set Phone to `+233244999000` (same as
   the registered patient), click **Dial**, press `1` (English), then
   `3` (Convulsions). The patient appears as **the same User** in the
   resulting alert — phone-as-identity in action.

5. **Triage the alert** from the dashboard: click **Ack**, then **Resolve**.
   Status badges update. Audit columns (`acknowledgedBy*`, `resolvedBy*`)
   are populated in the DB — `npm run prisma:studio` to inspect.

## API summary

All routes under `/api/*` are JSON. The non-API channels (`/ussd`, future
`/voice`) use channel-native formats.

| Method   | Path                  | Roles               | Purpose                          |
|----------|-----------------------|---------------------|----------------------------------|
| GET      | `/api/health`         | public              | liveness check                   |
| POST     | `/api/auth/register`  | public (creates PATIENT) | patient signup              |
| POST     | `/api/auth/login`     | public              | exchange email+password for JWT  |
| GET      | `/api/auth/me`        | any auth            | current user                     |
| POST     | `/api/patients`       | PATIENT             | upsert own clinical profile      |
| GET      | `/api/patients`       | CHW/DHO/ADMIN       | list all patients                |
| GET      | `/api/patients/:id`   | CHW/ADMIN or self   | patient detail                   |
| POST     | `/api/risk/check`     | PATIENT/CHW/ADMIN   | classify symptoms + persist + escalate |
| GET      | `/api/alerts`         | CHW/DHO/ADMIN       | list alerts (`?status=`)         |
| PATCH    | `/api/alerts/:id`     | CHW/ADMIN           | acknowledge / resolve            |
| GET      | `/api/notifications`  | CHW/DHO/ADMIN       | SMS log (`?status=&alertId=&limit=`) |
| POST     | `/ussd`               | AT callback         | USSD menu handler (form-encoded → CON/END text) |
| POST     | `/ussd/status`        | AT callback         | end-of-session status (no-op 200)|

All error responses follow `{ error: { message, code, details? } }`.

## Environment variables

| Variable                  | Required | Default | Notes                                  |
|---------------------------|----------|---------|----------------------------------------|
| `NODE_ENV`                | no       | `development` | `development`/`test`/`production` |
| `PORT`                    | no       | `4000`  |                                        |
| `DATABASE_URL`            | yes      | —       | Postgres connection string             |
| `JWT_SECRET`              | yes      | —       | Min 32 chars                           |
| `JWT_EXPIRES_IN`          | no       | `7d`    | jsonwebtoken-compatible duration       |
| `ESCALATION_CHW_PHONES`   | no       | `''`    | Comma-separated; SMS targets + voice `<Dial>` numbers |

## Architecture notes

The two non-negotiable rules:

1. **One backend, three endpoints — NOT three services.** Web + USSD + voice
   are controllers on the same Express app, sharing the same services and the
   same Postgres. See `docs/ARCHITECTURE.md §0`.

2. **Business logic lives in `services/`. Controllers only translate.** A
   controller turns a channel-specific request into a service call and the
   result into the channel's response format. If you find yourself writing
   `if (risk === 'HIGH')` inside a controller, that belongs in a service.

The current service surface:

```
services/
  auth.service.ts            register / login / getCurrentUser
  patient.service.ts         findOrCreateByPhone / upsertOwnProfile /
                             ensureProfileForUser / list / getByUserId /
                             getPatientById
  risk.service.ts            classify (pure) / assessAndRecord (persists +
                             auto-escalates on HIGH/EMERGENCY)
  escalation.service.ts      handle — raises Alert + queues SMS + returns
                             EscalationOutcome (bridgeToNumbers for voice)
  alert.service.ts           list / acknowledge / resolve
  notification.service.ts    send (simulated) / list
  ussd-session.service.ts    in-memory Map<sessionId, {lang}> with TTL
```

A high-risk case from any channel runs the same three-line pipeline:
`findOrCreateByPhone → assessAndRecord (→ escalationService.handle) → render`.
That shared pipeline is what makes "the same alert lands on the dashboard
regardless of channel" a property of the architecture, not a fact you have
to remember.

## Build status

Phase 1 complete (web + USSD + dashboard + simulated SMS). Voice/IVR is
architected (`Channel.VOICE` enum, `bridgeToNumbers` returned from
escalation) but not implemented — see `docs/ARCHITECTURE.md §8.5` for the
deferral rationale.
