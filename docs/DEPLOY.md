# Demo deployment — Render

End-to-end runbook to put the AfiaCare backend on Render's free tier for a
demo. No credit card required. Read time: 5 min. Wall-clock time including
Render's build queue: **45–90 min** depending on debug cycles.

> Production hardening (CORS allowlist, rate limiting, structured logging,
> upgraded plans) is **deliberately out of scope here**. This is a demo.

---

## 0. Before you start

You need:
- A GitHub account with this repo pushed (already done).
- A web browser. That's it.

You'll generate **no secrets locally** — Render produces the `JWT_SECRET`
itself, and `DATABASE_URL` is auto-wired by the Blueprint.

---

## 1. Sign up for Render — 2 min

1. Go to [render.com](https://render.com) → **Sign Up**.
2. Use "Sign in with GitHub" — saves a step later.
3. Authorize Render to read your repos (you can scope to just this one).

No credit card needed for the free tier.

---

## 2. Create the Blueprint — 5 min

1. Render dashboard → **New +** → **Blueprint**.
2. Select your repo (`afiacare-backend`).
3. Render reads `render.yaml` and shows a preview: **1 web service** +
   **1 Postgres database**. Confirm the names match (`afiacare-backend`,
   `afiacare-db`).
4. Click **Apply**.

Render will:
- Provision the Postgres (~2 min, instant on first try).
- Kick off the first build of the web service (~5–10 min — `npm ci` is
  the slow step).
- Auto-wire `DATABASE_URL` from the DB into the web service env.
- Generate a random `JWT_SECRET`.

---

## 3. Wait for the first build — 5–15 min

Watch the build log in the web service's "Logs" tab. Success looks like:

```
==> Running 'npm ci --include=dev && npx prisma generate && npm run build'
…
==> Build successful 🎉
==> Running 'npx prisma migrate deploy && npm start'
Prisma schema loaded from prisma/schema.prisma
1 migration found in prisma/migrations
Applying migration `20260526164842_init`
The following migration(s) have been applied:
…
[afiacare] listening on http://localhost:10000 (production)
==> Your service is live 🎉
```

If you see a build failure, jump to **§7 Troubleshooting**.

---

## 4. Set `ESCALATION_CHW_PHONES` — 1 min

The Blueprint deliberately leaves this blank so the first deploy doesn't
hang on a value only you have. To arm the SMS/`<Dial>` escalation path:

1. Web service dashboard → **Environment** tab.
2. Edit `ESCALATION_CHW_PHONES` → paste your phone in E.164 (`+233XXXXXXXXX`).
   Comma-separated for multiple recipients.
3. Click **Save Changes**. Render auto-redeploys (~3 min).

You can skip this for now and add it later. Risk assessments classified
as HIGH/EMERGENCY will still raise dashboard `Alert`s — just no SMS row
will be queued.

---

## 5. Seed demo accounts — 2 min

1. Web service dashboard → **Shell** tab.
2. Run:
   ```bash
   npm run db:seed
   ```
3. Expected output:
   ```
   [ok] CHW     chw@afiacare.demo
   [ok] DHO     dho@afiacare.demo
   [ok] ADMIN   admin@afiacare.demo
   Demo password for all seeded users: afiacare-demo
   ```

The seed uses `upsert`, so re-running it is safe — it won't create
duplicates.

---

## 6. Smoke test — 5 min

Your service URL is shown at the top of the web service page — looks
like `https://afiacare-backend-XXXX.onrender.com`. Replace `<URL>` below.

```bash
URL=https://afiacare-backend-XXXX.onrender.com

# Health
curl $URL/api/health
# -> {"status":"ok","uptime":12.345}

# Login as the seeded CHW
TOKEN=$(curl -sS -X POST $URL/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"chw@afiacare.demo","password":"afiacare-demo"}' \
  | python3 -c 'import json,sys; print(json.load(sys.stdin)["token"])')

# Read the (empty) alerts list
curl -sS -H "Authorization: Bearer $TOKEN" $URL/api/alerts
# -> {"alerts":[]}
```

Full demo flow (register a patient, run a risk check, see the alert
land) is in `docs/TESTING.md` — every command works against the Render
URL the same as against `http://localhost:4000`.

The first request after 15 min of idle takes ~30s (free-tier cold
start). Subsequent requests are instant.

---

## 7. Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| Build fails on `npx prisma generate` | Render's Node version mismatch | `package.json` engines pins `>=20`; confirm Render is on 20 in service settings. |
| Boot loops with `JWT_SECRET must be at least 32 characters` | Render didn't generate the secret | Env tab → delete `JWT_SECRET` → click Save → it regenerates on next deploy. |
| `prisma migrate deploy` fails with "no migrations found" | First deploy before `prisma/migrations/` was committed | Verify `prisma/migrations/20260526164842_init/` is on the deployed branch. |
| 502 / "Bad Gateway" right after deploy | Service still cold-starting | Wait 30s and retry. |
| `npm run db:seed` says "command not found: tsx" | Dev deps not installed | Confirm `buildCommand` includes `--include=dev` in `render.yaml`. |
| All POSTs fail with CORS errors from the frontend | `cors()` is open by default, so this shouldn't happen — but if you tightened it, allow the Vercel origin |

---

## 8. What this deploy intentionally does NOT do

- **No rate limiting** on `/ussd` and `/voice` — production must add it.
- **CORS is wide open** — production must allowlist the frontend origin.
- **Logs are stdout `console.log`** — production wants structured (pino).
- **No Africa's Talking integration** — separate sitting; see §9.
- **No frontend** — separate Vercel deploy; see §10.
- **Postgres expires after 90 days** on Render's free tier. Renew or
  upgrade before then.

---

## 9. Next: Africa's Talking sandbox

After the backend URL is live, the AT integration is a separate sitting:

1. Sign up at [africastalking.com](https://africastalking.com), KYC.
2. Create a sandbox app.
3. USSD: register a sandbox shortcode → callback URL =
   `https://<your-render-url>/ussd`.
4. Voice: provision a sandbox number → callback URL =
   `https://<your-render-url>/voice`.
5. SMS: swap `notification.service.send` to call AT's SMS SDK.
6. Whitelist your phone in the sandbox app's "Phone Numbers" tab.
7. Dial USSD via AT's simulator; call the voice number; trigger an
   EMERGENCY and wait for the SMS.

---

## 10. Next: frontend on Vercel

When the existing Next.js repo is ready:

1. Vercel → Import the repo.
2. Set `NEXT_PUBLIC_API_URL=https://<your-render-url>` in the Vercel
   project's env vars.
3. Deploy.

If CORS errors hit at this point, tighten `app.ts` to an env-driven
allowlist (`CORS_ORIGINS=https://<your-vercel-url>`) and redeploy
the backend.
