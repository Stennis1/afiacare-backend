# End-to-end testing guide

Step-by-step recipes for verifying the AfiaCare backend against a real
Postgres database. Mirrors the flow we walked together — copy/paste the
commands as-is.

All commands assume:
- You are in the repo root: `/home/stennis/Documents/Projects/afiacare-backend`
- Postgres is running on `localhost:5432`
- The `afiacare` role + database have been created (see §1)
- `npm install` has already been run

---

## 1. One-time setup

Only needed on a fresh machine or after a full reset.

### 1.1 Create the Postgres role + database (needs sudo)

```bash
sudo -u postgres psql -v ON_ERROR_STOP=1 <<'SQL'
CREATE ROLE afiacare WITH LOGIN PASSWORD 'afiacare_dev' CREATEDB;
CREATE DATABASE afiacare OWNER afiacare;
GRANT ALL PRIVILEGES ON DATABASE afiacare TO afiacare;
SQL
```

`CREATEDB` is required because `prisma migrate dev` spins up a shadow database for drift detection.

### 1.2 Confirm you can connect

```bash
PGPASSWORD=afiacare_dev psql -h localhost -U afiacare -d afiacare -c '\conninfo'
```

Expected: `You are connected to database "afiacare" as user "afiacare" ...`

### 1.3 Create `.env`

If it doesn't exist, copy the example and edit:

```bash
cp .env.example .env
```

Then set at least these two:
- `DATABASE_URL=postgresql://afiacare:afiacare_dev@localhost:5432/afiacare?schema=public`
- `JWT_SECRET=` a 64-char hex string. Generate with `openssl rand -hex 32`.

`.env` is git-ignored. Treat it as throwaway for dev.

### 1.4 Generate the Prisma client + apply migrations + seed

```bash
npx prisma generate
npx prisma migrate dev --name init
npm run db:seed
```

Expected:
- 5 application tables + 7 enums in the DB
- 3 staff rows in `User` (CHW, DHO, ADMIN), all with password `afiacare-demo`

### 1.5 Start the dev server

```bash
npm run dev
```

Expected log line: `[afiacare] listening on http://localhost:4000 (development)`

Health check from a second terminal:

```bash
curl -s http://localhost:4000/api/health
```

Expected: `{"status":"ok","uptime":<seconds>}`

---

## 2. Web flow (5 steps)

These curls reproduce the full patient → CHW story. Run them in order in
one terminal — they stash intermediate values in `/tmp/`.

### 2.1 Register a patient

```bash
curl -s -X POST http://localhost:4000/api/auth/register \
  -H 'Content-Type: application/json' \
  -d '{"email":"akosua@example.com","password":"hunter2hunter2","fullName":"Akosua Mensah","phone":"+233244111222"}' \
  | tee /tmp/register.json
jq -r .token /tmp/register.json > /tmp/patient.token
jq -r .user.id /tmp/register.json > /tmp/patient.id
```

Expected: JSON with `user.role: "PATIENT"` (server forces it) and a JWT.

### 2.2 Upsert the maternal profile

```bash
curl -s -X POST http://localhost:4000/api/patients \
  -H "Authorization: Bearer $(cat /tmp/patient.token)" \
  -H 'Content-Type: application/json' \
  -d '{"district":"Greater Accra","gestationalWeeks":32,"gravida":2,"parity":1,"bloodGroup":"O+"}'
```

Expected: JSON with `profile.id` and the fields you submitted.

### 2.3 Trigger an EMERGENCY risk check

```bash
curl -s -X POST http://localhost:4000/api/risk/check \
  -H "Authorization: Bearer $(cat /tmp/patient.token)" \
  -H 'Content-Type: application/json' \
  -d '{"symptoms":{"convulsions":true,"severeHeadache":true,"lang":"en"}}' \
  | jq .
```

Expected:
- `level: "EMERGENCY"`
- `reasons: ["CONVULSIONS","HEADACHE"]`
- `escalate: true`

Side effects already happened by the time the response returned: a new
`RiskAssessment` row + an `OPEN` `Alert` row. Verify:

```bash
PGPASSWORD=afiacare_dev psql -h localhost -U afiacare -d afiacare -c \
  'SELECT id, level, status FROM "Alert" ORDER BY "createdAt" DESC LIMIT 1;'
```

Note the alert `id` — you'll need it for step 2.5. Save it:

```bash
PGPASSWORD=afiacare_dev psql -h localhost -U afiacare -d afiacare -tAc \
  'SELECT id FROM "Alert" ORDER BY "createdAt" DESC LIMIT 1;' > /tmp/alert.id
cat /tmp/alert.id
```

### 2.4 Log in as CHW + list open alerts

```bash
curl -s -X POST http://localhost:4000/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"chw@afiacare.demo","password":"afiacare-demo"}' \
  | tee /tmp/chw.json
jq -r .token /tmp/chw.json > /tmp/chw.token

curl -s http://localhost:4000/api/alerts \
  -H "Authorization: Bearer $(cat /tmp/chw.token)" | jq .
```

Expected: an `alerts` array containing the alert you just triggered, with
`patient.fullName`, `riskAssessment.reasons`, and the localized
`recommendation` already joined in.

### 2.5 CHW resolves the alert (skip-ack path)

```bash
curl -s -X PATCH "http://localhost:4000/api/alerts/$(cat /tmp/alert.id)" \
  -H "Authorization: Bearer $(cat /tmp/chw.token)" \
  -H 'Content-Type: application/json' \
  -d '{"action":"resolve"}' | jq .
```

Expected:
- `status: "RESOLVED"`
- `acknowledgedAt == resolvedAt` (same timestamp — backfilled)
- `acknowledgedById == resolvedById` (the CHW)

This proves the state-machine invariant ("ack before resolve") is preserved
even when a CHW skips the ack step.

---

## 3. USSD flow

Africa's Talking POSTs `application/x-www-form-urlencoded`. **Use
`--data-urlencode`** so the leading `+` in the phone number doesn't decode
to a space.

### 3.1 Walk the screens

```bash
SESSION='ussd-demo-001'
PHONE='+233244111222'      # Akosua's phone — reuses her User row

echo '---screen 0 (dial *928#)---'
curl -s -X POST http://localhost:4000/ussd \
  --data-urlencode "sessionId=$SESSION" \
  --data-urlencode "serviceCode=*928#" \
  --data-urlencode "phoneNumber=$PHONE" \
  --data-urlencode "text="
echo; echo

echo '---screen 1 (press 1 = English)---'
curl -s -X POST http://localhost:4000/ussd \
  --data-urlencode "sessionId=$SESSION" \
  --data-urlencode "serviceCode=*928#" \
  --data-urlencode "phoneNumber=$PHONE" \
  --data-urlencode "text=1"
echo; echo

echo '---screen 2 (press 1*3 = English then Convulsions)---'
curl -s -X POST http://localhost:4000/ussd \
  --data-urlencode "sessionId=$SESSION" \
  --data-urlencode "serviceCode=*928#" \
  --data-urlencode "phoneNumber=$PHONE" \
  --data-urlencode "text=1*3"
echo
```

Expected:
- Screen 0: `CON Welcome to AfiaCare ... 1.English 2.Twi 3.Dagbani 4.Ewe`
- Screen 1: `CON Select your main symptom: ... 1.Bleeding 2.Headache ...`
- Screen 2: `END This may be a life-threatening emergency. ...`

### 3.2 Verify cross-channel reconciliation

```bash
PGPASSWORD=afiacare_dev psql -h localhost -U afiacare -d afiacare <<'SQL'
SELECT (SELECT COUNT(*) FROM "User")           AS users,
       (SELECT COUNT(*) FROM "Patient")        AS patients,
       (SELECT COUNT(*) FROM "RiskAssessment") AS risk_assessments,
       (SELECT COUNT(*) FROM "Alert")          AS alerts;

SELECT ra.id, ra.channel, u.email, u.phone
  FROM "RiskAssessment" ra
  JOIN "Patient" p ON p.id = ra."patientId"
  JOIN "User" u    ON u.id = p."userId"
 ORDER BY ra."createdAt";
SQL
```

Expected: **users + patients counts are unchanged** vs. before USSD; new
RiskAssessment + Alert rows share Akosua's `patientId`.

### 3.3 Confirm phone normalization

Dial USSD using a non-E.164 format (`0244111222`, Ghana local style):

```bash
SESSION='ussd-normalize'
curl -s -X POST http://localhost:4000/ussd \
  --data-urlencode "sessionId=$SESSION" \
  --data-urlencode "serviceCode=*928#" \
  --data-urlencode "phoneNumber=0244111222" \
  --data-urlencode "text=1*1"
echo
```

Then re-run the counts query in 3.2 — `users` and `patients` should still
not have grown. The `0244111222` was normalized to `+233244111222` inside
`patient.service.findOrCreateByPhone` and matched Akosua's existing row.

---

## 4. Enabling the SMS / notification path (your phone)

By default the `Notification` table stays empty during demos because
`ESCALATION_CHW_PHONES` in `.env` is empty — `escalation.service.handle()`
has no one to "SMS." Even with the real SMS swap done later, this is the
switch that turns on the notification side-effect.

### 4.1 Add your phone to `.env`

Edit `.env` and set the env var. Comma-separated, E.164 (or any format
the normalizer accepts — though the SMS payload is sent verbatim, so prefer
E.164 here):

```
ESCALATION_CHW_PHONES=+2335XXYYYYYYY
```

You can add multiple recipients: `+233...,+233...`.

### 4.2 Restart the dev server

`env.ts` validates and freezes env at boot, so `.env` changes only take
effect on restart. If `npm run dev` is running, Ctrl+C and re-run:

```bash
npm run dev
```

(`tsx watch` rebuilds on `src/` changes but does NOT reload on `.env`
changes — it would have to restart Node to re-read env, which defeats the
fast-reload point.)

### 4.3 Trigger an EMERGENCY again

Reuse the patient token from step 2.1 (or register a fresh patient):

```bash
curl -s -X POST http://localhost:4000/api/risk/check \
  -H "Authorization: Bearer $(cat /tmp/patient.token)" \
  -H 'Content-Type: application/json' \
  -d '{"symptoms":{"convulsions":true,"lang":"en"}}' | jq .
```

### 4.4 Verify a Notification row landed

```bash
PGPASSWORD=afiacare_dev psql -h localhost -U afiacare -d afiacare -c \
  'SELECT id, "to", status, body, "createdAt" FROM "Notification" ORDER BY "createdAt" DESC LIMIT 5;'
```

Expected: one row per phone in `ESCALATION_CHW_PHONES`, with:
- `to` = the phone number you added
- `status = SENT` (Phase 1: simulated — the row is the proof)
- `body` containing the patient name + risk level + recommendation snippet

You should also see a `[notification][SENT]` log line in the dev server's
console. **No real SMS goes out yet** — that's the Phase 2 swap where
`notification.service.send()` is rewired to call Africa's Talking. Every
caller in the codebase stays unchanged.

---

## 5. Browser-driven demos

The dev server also serves the two phone-screen simulators at:

- `http://localhost:4000/ussd-simulator.html` — phone-screen UI that POSTs
  to `/ussd`. Use it to walk the USSD flow with mouse clicks instead of
  curl.
- `http://localhost:4000/dashboard.html` — CHW console. Paste a CHW JWT
  (from step 2.4) into the token box; the page polls `/api/alerts` and
  `/api/notifications` and lets you Acknowledge / Resolve via PATCH.

---

## 6. Resetting the database

When you want a clean slate (between demo runs, after schema changes, etc.):

```bash
# Nukes ALL data + reapplies migrations + re-seeds staff users
npx prisma migrate reset --force
```

The `--force` skips the interactive confirm. After this you have:
- Empty patient/risk/alert/notification tables
- The 3 seeded staff users (CHW, DHO, ADMIN, password `afiacare-demo`)

---

## 7. Useful psql cheatsheet

Open an interactive shell:

```bash
PGPASSWORD=afiacare_dev psql -h localhost -U afiacare -d afiacare
```

Inside the shell:

```sql
\dt                                  -- list tables
\d "User"                            -- describe User table + indexes
\dT                                  -- list enums
SELECT id, email, role FROM "User";
SELECT * FROM "Alert" WHERE status='OPEN';
SELECT ra.level, ra.reasons, u.phone
  FROM "RiskAssessment" ra
  JOIN "Patient" p ON p.id = ra."patientId"
  JOIN "User" u    ON u.id = p."userId"
 ORDER BY ra."createdAt" DESC LIMIT 10;
\q                                   -- quit
```

For a GUI: `npm run prisma:studio` opens Prisma's web inspector at
`http://localhost:5555`.

---

## 8. API endpoint reference

| Method | Path | Auth | Roles | Purpose |
|---|---|---|---|---|
| GET    | `/api/health`                | none      | any           | Liveness check |
| POST   | `/api/auth/register`         | none      | (forces PATIENT) | Web signup |
| POST   | `/api/auth/login`            | none      | any           | Email/password → JWT |
| GET    | `/api/auth/me`               | Bearer    | any           | Current user |
| POST   | `/api/patients`              | Bearer    | PATIENT       | Upsert own maternal profile |
| GET    | `/api/patients`              | Bearer    | CHW/DHO/ADMIN | List all patients |
| GET    | `/api/patients/:id`          | Bearer    | CHW/ADMIN or self | Patient detail |
| POST   | `/api/risk/check`            | Bearer    | PATIENT (self) or CHW/ADMIN (any patientId) | Run risk classifier; auto-escalates HIGH/EMERGENCY |
| GET    | `/api/alerts`                | Bearer    | CHW/DHO/ADMIN | List alerts (default non-RESOLVED) |
| PATCH  | `/api/alerts/:id`            | Bearer    | CHW/ADMIN     | `{action: "acknowledge" | "resolve"}` |
| GET    | `/api/notifications`         | Bearer    | CHW/DHO/ADMIN | List recent notifications |
| POST   | `/ussd`                      | none      | (phone is identity) | Africa's Talking USSD callback |
| POST   | `/ussd/status`               | none      | n/a           | AT end-of-session status callback (no-op 200) |

---

## 9. Troubleshooting

**`error: role "afiacare" does not exist`** — run §1.1 again. The sudo command failed silently or you reset the DB cluster.

**`Error: P1001: Can't reach database server`** — Postgres isn't running. `systemctl is-active postgresql` should print `active`. If not: `sudo systemctl start postgresql`.

**`Environment variable not found: DATABASE_URL`** — `.env` missing or in the wrong directory. Must be at repo root, not in `src/` or `prisma/`.

**`JWT_SECRET must be at least 32 characters`** — regenerate: `openssl rand -hex 32` and paste into `.env`.

**USSD response shows duplicate User** — your phone wasn't normalized. Confirm `src/services/patient.service.ts` imports and calls `normalizeGhPhone` in `findOrCreateByPhone`. The fix landed after the cross-channel walkthrough; if you don't have it, see the commit log.

**Notification table stays empty after EMERGENCY** — `ESCALATION_CHW_PHONES` is empty in `.env`, or you didn't restart the server after editing `.env`. See §4.
