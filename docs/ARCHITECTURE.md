# AfiaCare — Backend Architecture Spec

> **How to use this file:** This is the source-of-truth context for building the
> backend. Paste it into Claude Code as project context before generating code.
> It defines the contracts and rules; it deliberately does *not* contain final
> implementations — Claude Code generates those against these contracts.

### Project parameters (the real AfiaCare shape)
- **Product:** AfiaCare — multilingual AI maternal-health triage for Ghana.
- **Frontend:** already built, deployed on Vercel (`afiacare-one.vercel.app`).
  It is a SEPARATE deployment that talks to this backend over the REST API.
- **USSD code:** `*928#` (feature phones, no internet).
- **Languages:** English, Twi, Dagbani, Ewe — see §11 for the per-channel
  language reality (text is cheap in all four; *voice* is the constrained one).
- **Risk levels:** Low · Medium · High · **Emergency** (4 levels, not 3).
- **Audiences / roles:** Pregnant women · Community Health Workers (CHW) ·
  District Health Officers (DHO) · NGOs/Government. See §2 for the role model.

> **"Same backend" means same *API*, not same deployment.** Your Vercel
> frontend, the `*928#` USSD endpoint, and the future voice endpoint are three
> clients of one Express service (one repo, one Postgres). Three doors, one
> building.

---

## 0. The one decision everything hangs on

**USSD and web are two clients of ONE backend.** They do not get separate
backends, separate logic, or separate databases. They share:

- the same **services** (business logic),
- the same **PostgreSQL** database (single source of truth),
- the same **risk classifier**.

They differ ONLY in the thin layer that translates between the client's
language (HTTP+JSON for web, `CON`/`END` text for USSD) and a service call.

```
   Web (Next.js)        USSD (Africa's Talking)      Voice/IVR (AT, Phase 3)
   JWT + JSON           form-POST, CON/END text       form-POST, XML + TTS
        |                        |                            |
        +-----------+------------+-------------+--------------+
                    v                          v
        +-----------------------------------------------------+
        |  Express API                                         |
        |  controllers/  routes/   middleware/                 |  <- THIN
        |  (parse, validate, auth, format response)            |
        +-----------------------------------------------------+
        |  services/   <-- ALL BUSINESS LOGIC LIVES HERE       |  <- THE BRAIN
        |  auth · patients · risk · alerts · notifications     |     (no HTTP,
        |  Services know NOTHING about HTTP/USSD/Voice.        |      no USSD,
        +-----------------------------------------------------+      no voice)
        |  Prisma  ->  PostgreSQL   (single source of truth)   |
        +-----------------------------------------------------+
```

### The non-negotiable rule

> **Business logic lives in services. Controllers and the USSD handler contain
> ZERO logic — they only translate.**

- A **controller** turns an HTTP request into a service call and the result into JSON.
- The **USSD handler** turns a menu tap into a service call and the result into a `CON`/`END` string.
- Both call e.g. `riskService.classify(...)` and `patientService.findOrCreateByPhone(...)`.

If you ever find yourself writing an `if (risk === 'HIGH')` decision inside a
controller or the USSD handler, STOP — that belongs in a service.

### Count carefully: ONE backend, THREE endpoints — NOT three services

> **CRITICAL for whoever scaffolds this.** "Web, USSD, and IVR" are three
> *channels the user can use* — they are **endpoints (controllers) on one Express
> app**, NOT three separate services/apps/repos/deployments. Do NOT build three
> backends. Do NOT split into microservices. That is exactly the
> over-engineering Rule 1 forbids, and it re-forks the logic this whole design
> exists to keep unified.

The word "service" in this project means a **shared logic module**
(`riskService`, `alertService`, …) — the reusable code behind the doors. It does
NOT mean a channel. The deployment topology is:

```
Deployment 1: AfiaCare frontend (Next.js on Vercel) — separate, talks to API over HTTPS
Deployment 2: ONE Express backend (one repo, one Postgres), exposing 3 endpoints:
    /api/*   REST + JSON   (for the frontend)
    /ussd    CON/END text  (Africa's Talking USSD)
    /voice   XML Say/Play/Dial (Africa's Talking Voice)
  …all three endpoints call the SAME shared services and the SAME database.
```

**Channel routing is a telco concern, not your code.** Which endpoint a request
hits is decided by Africa's Talking before it reaches you (`*928#` → `/ussd`; a
call to the voice number → `/voice`). Your backend never inspects "what number
was dialed" — it just serves whichever endpoint AT called. (See §0.1 on the
number/short-code distinction.)

---

## 0.1 Numbering: `*928#` (USSD) ≠ the voice number

A natural assumption is "USSD is `*928#`, so IVR is `928`." **It isn't — they're
different kinds of address, provisioned separately on AT's side.**

- `*928#` is a **USSD short code**: a string the dialer interprets as "open a
  USSD data session." It is NOT a phone number; you cannot place a *call* to it.
- IVR/voice needs a **voice-enabled phone number** AT provisions for you (a
  normal MSISDN like `+233…`, or in some markets a short code enabled for voice).
  A call rings *this*, then AT POSTs your `/voice` endpoint.

For brand coherence, present them as one service even though they're two
addresses: advertise "Dial `*928#` or call `0800-928-XXXX`" — shared "928" motif,
two underlying addresses. (A single code serving BOTH USSD and voice is
sometimes possible but is an AT/telco provisioning + regulatory question, not a
code question — don't make the architecture depend on it.)

**Why this doesn't block the build:** numbering lives entirely outside your code.
The backend exposes `/ussd` and `/voice`; AT's dashboard maps the short
code/number to those URLs. You can build and test both endpoints (via the USSD
simulator and a voice number) before any final numbering is settled.

---

## 1. Stack (locked)

| Layer        | Choice                          | Notes                                            |
|--------------|---------------------------------|--------------------------------------------------|
| Frontend     | Next.js + TypeScript + Tailwind | Web client only                                  |
| Backend      | Node + Express + TypeScript     | One API for all clients                          |
| ORM / DB     | Prisma + PostgreSQL             | Single source of truth                           |
| Auth (web)   | JWT (access token) + bcrypt     | No third-party auth dependency                   |
| Auth (USSD)  | phone number identity           | No login on USSD — `phoneNumber` IS the identity |
| Risk engine  | **Rule-based** classifier       | Deterministic, auditable, demo-safe              |
| USSD gateway | Africa's Talking                | + local simulator for dev/demo                   |
| USSD session | **in-memory `Map`**             | Redis is the documented scale path, not built    |
| Voice / IVR  | Africa's Talking Voice (Phase 3)| TTS output + DTMF input; XML response; phone = ID |
| Messaging    | Simulated (logged to dashboard) | Real SMS swapped in later; same service seam     |

---

## 2. Identity model — the bridge between USSD and web

This is the subtle part. Two clients, two ways of knowing "who is this?":

- **Web user** authenticates with email + password, receives a **JWT**.
- **USSD user** is identified ONLY by the **phone number** Africa's Talking sends.
  There is no login prompt on a feature phone.

To keep these from forking into two separate patient records, **`phone` is a
first-class unique field on `User` from day one.**

- A USSD interaction does `patientService.findOrCreateByPhone(phoneNumber)`.
- A web signup creates a `User` with email + password (+ optional phone).
- If the same person later appears on both channels, the unique `phone` lets you
  reconcile them into one record instead of two.

### Roles (AfiaCare's four audiences)
```
PATIENT  — pregnant woman. Self-signup (web) or auto-created by phone (USSD/voice).
CHW      — Community Health Worker. Sees patients ranked by risk, handles alerts.
DHO      — District Health Officer. Read-only aggregate metrics across districts.
ADMIN    — system/NGO admin. Manages users, full access.
```
Seeding rule unchanged: PATIENT is the only role obtainable via public signup.
CHW, DHO, and ADMIN are seeded or invited — never self-assigned (anyone could
otherwise tick "admin"). The `Role` enum becomes:
`enum Role { PATIENT  CHW  DHO  ADMIN }`.

> NGOs/Government from the landing page aren't a *login role* — they're the DHO
> dashboard's audience plus, later, exported reports. Don't create a 5th role for
> them in Phase 1; `DHO` covers the read-only oversight view.

Staff routes that previously said `(NURSE/ADMIN)` now mean `(CHW/ADMIN)` for
operational actions and `(DHO/ADMIN)` for read-only metrics. Update
`role.middleware` calls accordingly.

---

## 3. Folder structure (matches the playbook)

```
backend/src/
  controllers/   # thin: req -> service -> res. one per resource/channel.
    auth.controller.ts
    patient.controller.ts
    risk.controller.ts
    ussd.controller.ts        # USSD translation layer (text CON/END)
    voice.controller.ts       # Voice/IVR translation layer (XML Say/Play/Dial)
  routes/        # url -> controller wiring + which middleware applies
    auth.routes.ts
    patient.routes.ts
    risk.routes.ts
    ussd.routes.ts
    voice.routes.ts
  services/      # ALL business logic. framework-agnostic, unit-testable.
    auth.service.ts
    patient.service.ts
    risk.service.ts
    alert.service.ts          # CRUD on alerts (raise/list/resolve)
    escalation.service.ts     # decides WHAT escalation happens on HIGH/EMERGENCY
    notification.service.ts   # SMS (simulated in Phase 1)
    ussd-session.service.ts   # in-memory Map state store for USSD
    voice-session.service.ts  # in-memory Map state store for voice
  middleware/
    auth.middleware.ts        # verify JWT -> req.user
    role.middleware.ts        # requireRole('CHW','ADMIN')
    error.middleware.ts       # central error handler
    validate.middleware.ts    # zod schema runner
  models/        # zod schemas / DTO types (Prisma owns the DB models)
  utils/
    jwt.ts
    password.ts               # bcrypt wrap
    api-error.ts              # typed error class
    voice-xml.ts              # Say()/Play()/GetDigits()/Dial()/buildResponse() helpers
  config/
    env.ts                    # validated env vars (fail fast on boot)
    prisma.ts                 # single PrismaClient instance
  app.ts                      # express app assembly (no listen)
  server.ts                   # imports app, listens on PORT

backend/prisma/
  schema.prisma
  seed.ts                     # seeds CHW + DHO + ADMIN for the demo
```

---

## 4. Web REST API contract

All web routes are prefixed `/api`. JSON in, JSON out. Errors use a consistent
shape: `{ error: { message, code } }`.

### Auth
```
POST /api/auth/register   { email, password, fullName, phone? }   -> { user, token }   (role forced to PATIENT)
POST /api/auth/login      { email, password }                     -> { user, token }
GET  /api/auth/me         (Bearer token)                          -> { user }
```

### Patients
```
POST /api/patients              (PATIENT/CHW/ADMIN)    register/attach maternal profile
GET  /api/patients              (CHW/DHO/ADMIN)          list + filter by risk
GET  /api/patients/:id          (CHW/ADMIN, or self)  patient detail
```

### Risk (the AI symptom checker)
```
POST /api/risk/check   { patientId?, symptoms: SymptomInput }  -> RiskResult
```

### Dashboard / alerts (Phase 1 minimal)
```
GET  /api/alerts          (CHW/DHO/ADMIN)   open escalations
PATCH /api/alerts/:id     (CHW/ADMIN)       acknowledge / resolve
```

---

## 5. The risk classifier (shared by web + USSD)

`riskService.classify(input: SymptomInput): RiskResult`

```ts
type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'EMERGENCY';   // 4 levels (per AfiaCare UI)
type Lang = 'en' | 'tw' | 'dag' | 'ee';                      // English, Twi, Dagbani, Ewe

interface SymptomInput {
  // structured flags — the SAME shape from web, USSD, and voice.
  // web can collect richer data; USSD/voice send the numeric-menu subset.
  bleeding?: boolean;
  severeHeadache?: boolean;
  blurredVision?: boolean;
  reducedFetalMovement?: boolean;
  highBloodPressure?: boolean;
  feverChills?: boolean;
  swellingFaceHands?: boolean;
  convulsions?: boolean;          // danger sign — eclampsia
  gestationalWeeks?: number;
  lang?: Lang;                    // which language to render the recommendation in
  // ...extend as needed; every field is optional so partial USSD input works
}

interface RiskResult {
  level: RiskLevel;               // LOW | MEDIUM | HIGH | EMERGENCY
  reasons: string[];              // which rules fired — auditable, language-neutral keys
  recommendation: string;         // patient-facing text, rendered in input.lang
  escalate: boolean;              // true for HIGH/EMERGENCY => alertService raises an alert
}
```

> **Risk decision is language-neutral.** `level`, `reasons`, and `escalate` are
> computed purely from the symptom flags — language never affects the medical
> outcome. Only `recommendation` is localized (see §11). This keeps the four
> languages from ever touching the risk logic.

### Why rule-based (and where the LLM fits later)

The **risk decision** is a hardcoded, auditable rule table — e.g.
`bleeding || severeHeadache+highBloodPressure => HIGH`. It is instant,
deterministic, and never produces a surprising result on stage. This honors the
playbook rule that *AI must not claim medical certainty* — the AI isn't making
the medical call at all.

**Localization seam:** the `recommendation` string is the ONLY language-varying
output. Render it from per-language template tables keyed by `level` + `reasons`
(see §11). An LLM may LATER soften/translate wording, but the demo-safe default
is fixed translated templates — deterministic and reviewable. The rules own the
decision; localization only touches phrasing. Keep `classify()` returning the
raw decision so language work never touches risk logic.

---

## 5.5 Channel processing threads + escalation

This section pins the exact request thread for each channel and how escalation
works, so the controllers get built against the intended flow.

### Escalation: one service, two mechanisms (your "phone call or alert or both")
`escalationService.handle(result, { channel, patient }): EscalationOutcome`

On every HIGH or EMERGENCY result, from ANY channel:
- **Always (silent):** `alertService.raise(...)` to surface the case on the CHW
  dashboard, AND `notificationService.send(...)` to SMS the on-call CHW. This
  guarantees a high-risk case is never lost — even on USSD/web, where there is no
  live call to bridge.
- **Voice channel only (live):** the outcome also signals "bridge this call,"
  so `voice.controller` emits a `<Dial>` to the CHW number(s) and the caller is
  connected in the same call. Web/USSD ignore this signal (no call exists).

```ts
interface EscalationOutcome {
  raisedAlertId: string;       // dashboard alert id (always, for HIGH/EMERGENCY)
  smsQueued: boolean;          // SMS to CHW (always, for HIGH/EMERGENCY)
  bridgeToNumbers: string[];   // CHW numbers to <Dial> — only consumed by voice
}
```
> The decision of WHO to alert / WHICH numbers to bridge lives in
> `escalationService`, not in any controller. A controller only *consumes* the
> outcome in its own dialect: the dashboard reads the alert, the voice controller
> reads `bridgeToNumbers` and renders `<Dial>`. Same rule everywhere; if the
> escalation policy changes, you edit one service.

### Thread A — USSD (silent, text only, NO audio, NO call bridging)
Every keypress is a **fresh POST** to `/ussd`; the session is reconstructed from
`text`, not held open. Nothing is read aloud. Ends in a displayed message.
```
dial *928#        text=""        -> CON  language menu (1 En·2 Tw·3 Dag·4 Ewe)
press 2           text="2"       -> CON  symptom menu (in Twi)
press 1           text="2*1"     -> CON  next symptom screen
press 3           text="2*1*3"   -> [findOrCreateByPhone] [riskService.classify]
                                     if HIGH/EMERGENCY: escalationService.handle()
                                       -> dashboard alert + SMS (NO <Dial> — USSD can't)
                                  -> END  "<localized recommendation>. A CHW was alerted."
```
USSD escalation is entirely behind the scenes — the dialer is never connected to
a person; they get a text instruction + the CHW is alerted out-of-band.

### Thread B — Voice / IVR (spoken/played prompts, keypress input, CAN bridge)
Each keypress POSTs `/voice` with a `dtmf` field. You respond with XML. On high
risk, you speak a reassurance line THEN bridge — never an abrupt transfer.
```
call voice number   (no dtmf)    -> GetDigits+Play  language menu (spoken)
dtmf=2 (Twi)                     -> GetDigits+Play  symptom menu (Twi clips)
dtmf=1 …                         -> GetDigits+Play  next symptom prompt
dtmf=3 (last)                    -> [findOrCreateByPhone] [riskService.classify]
                                    branch on result.level:
   LOW/MEDIUM   -> Say/Play advice, then end call (no GetDigits = hang up)
   HIGH/EMERG.  -> escalationService.handle()  (dashboard alert + SMS always)
                -> Play: "This may be serious. Connecting you to a health
                   worker now — please stay on the line."
                -> <Dial phoneNumbers="{outcome.bridgeToNumbers}"/>  (live bridge)
```

### The `<Dial>` action (Africa's Talking)
A voice-XML action that bridges the active caller to one or more phone numbers.
Returned inside `<Response>` like any other action:
```xml
<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="woman">This may be serious. Connecting you to a health worker now.</Say>
  <Dial phoneNumbers="+233XXXXXXXXX" record="true" maxDuration="600"/>
</Response>
```
- `phoneNumbers` — comma-separated; AT rings them (sequentially or together).
- Useful attrs: `record` (keep audio for follow-up), `maxDuration`, `ringbackTone`.
- **Demo tip:** point `bridgeToNumbers` at a teammate's phone in the room. A live
  ring on stage is a showstopper; a CHW's phone that happens to be off is a
  flop. Make the target configurable via env so you can swap it instantly.

### Thread C — Web
Standard REST: the frontend POSTs symptoms as JSON to `/api/risk/check`, gets a
`RiskResult` back, renders it. On HIGH/EMERGENCY the same `escalationService`
fires (dashboard alert + SMS); there's no `<Dial>` because there's no call —
a browser high-risk case still surfaces to the CHW identically.

---

## 6. USSD endpoint — Africa's Talking contract

### What AT sends (verified)
A `application/x-www-form-urlencoded` **POST** with these fields on `req.body`:

| Field        | Meaning                                                              |
|--------------|----------------------------------------------------------------------|
| `sessionId`  | unique per dial session — your state key                             |
| `serviceCode`| the dialed code, e.g. `*384*1234#`                                    |
| `phoneNumber`| the user's MSISDN — **this is their identity**                       |
| `text`       | cumulative input. `""` on first hit; later `"1"`, then `"1*2"`, etc. |

> Mount `express.urlencoded({ extended: false })` for the USSD route — AT does
> NOT send JSON.

### What you return
**Plain text**, prefixed:
- `CON <menu>` — keep session open, expect more input.
- `END <message>` — terminate and show final message.

Hard limits to respect: ~**182 chars** per screen; feature-phone users; numeric
menus only.

### How to read `text` (the mental model)
`text` is the whole journey so far, `*`-separated. Two ways to drive the flow:

1. **Parse the string** (`text.split('*')`) — fine for shallow menus.
2. **Session store** keyed by `sessionId` — cleaner once the flow has a few
   steps. We use this: `ussd-session.service.ts` holds an in-memory `Map<
   sessionId, { step, data }>`. Sessions are seconds long, so memory is fine.
   (Redis = the scale story; not built for the hackathon.)

### The USSD controller is STILL just a translator
```
dial *384*1234#  ->  text===""        ->  CON main menu
tap "1" (symptoms) ->  text==="1"      ->  CON "1.Bleeding 2.Headache 3.Less movement..."
tap "1*1"          ->  text==="1*1"    ->  patientService.findOrCreateByPhone(phoneNumber)
                                          riskService.classify({bleeding:true})
                                          -> END "<recommendation>. A health worker has been alerted."
```
Notice: the controller calls the SAME `riskService.classify` the web API calls.
No risk logic in the USSD layer. If `result.escalate`, it calls
`escalationService.handle(result, { channel: 'ussd', patient })` exactly like the
web path does — raising the dashboard alert + SMS (it ignores `bridgeToNumbers`,
since USSD can't place a call). A high-risk USSD case shows up on the CHW
dashboard identically to a web or voice case. That single shared path is the
whole demo's punchline.

### Status callback (optional, know it exists)
AT also POSTs a separate end-of-session status callback (`date`, `sessionId`,
`status`, `cost`, `durationInMillis`, `input`, ...). Not needed for the demo;
add a no-op `POST /ussd/status` that returns `200 OK` if AT requires it.

---

## 7. USSD local simulator (build this — it de-risks the demo)

Do not block on a live shortcode. Build a tiny dev page / script that POSTs the
exact AT payload (`sessionId, serviceCode, phoneNumber, text`) to your real
`/ussd` endpoint and renders the `CON`/`END` response as a phone screen.

- The endpoint is real. The logic is real. Only the telco is faked.
- Swapping in the real Africa's Talking sandbox later is a **zero-code-change**
  to your endpoint — you just point AT's callback URL at it.
- AT also provides a sandbox simulator in their dashboard; the local one means
  you can demo with no network dependency at all.

---

## 8. Messaging / notifications (Phase 1 = simulated)

`notification.service.ts` exposes `send({ to, body, channel })`. In Phase 1 it
**logs** the message and pushes it to a dashboard "Notifications" panel —
showing the SMS that *would* go out. Real Africa's Talking SMS slots in behind
the same `send()` signature later. Never call a telco SDK directly from a
controller; always go through this service.

---

## 8.5 Channel 3: Voice / IVR (Phase 3 — seam open now, build later)

> **Status:** Architect for it now (it's just another controller). Do NOT build
> until Phase 1 + 2 are solid and demoed. Voice is the highest-effort,
> highest-fragility channel and must never threaten the core demo.

### The same rule, a third time
Voice is a **third front door** onto the same backend. The voice handler is a
sibling of the USSD handler: it translates a phone keypress into a service call
and the result into "say this." It calls the SAME `riskService.classify()`,
`patientService.findOrCreateByPhone()`, and `escalationService.handle()`. **No
risk logic in the voice layer.** A high-risk voice call lands on the CHW
dashboard identically to a web or USSD case — AND, uniquely, voice can bridge the
live call via `<Dial>` (see §5.5). That shared path is the demo punchline.

### Scope decision (locked)
- **Output = mostly pre-recorded audio via `<Play>`, English via `<Say>`.**
  AT's `<Say>` TTS is English-centric (see §11) — it does NOT reliably speak
  Twi/Dagbani/Ewe. So local-language prompts are recorded MP3 clips played with
  `<Play url="...">`; only English dynamic text uses `<Say>`.
- **Input = DTMF keypresses, NOT speech recognition.** The caller presses
  numbers; we never try to understand spoken Twi/Akan over a phone line.
  Speech-to-text is a live-demo landmine and is explicitly out of scope.
- **Language = caller selects at the top of the call.** A spoken/played menu:
  press 1 English · 2 Twi · 3 Dagbani · 4 Ewe. Every later prompt uses that
  language's clip set. (Realistically launch voice in English + Twi first — §11.)

> The model: **Voice = USSD's logic, delivered as played/spoken menus + keypress
> input, in the caller's chosen language.** The caller never reads or types.

### Africa's Talking Voice contract (verified)
Caller dials your **virtual number** → AT POSTs to your voice callback URL
(form-encoded, like USSD). You respond with **XML** (not plain text like USSD).

The actions you need:
- `<Say voice="woman">text</Say>` — read English text aloud via TTS (dynamic).
- `<Play url="https://.../clip.mp3"/>` — play a pre-recorded clip (local-language
  menus and result templates).
- `<GetDigits ...>` — wrap a `<Say>` or `<Play>` to deliver a prompt AND capture
  a keypress. Attributes: `timeout`, `finishOnKey="#"`, `numDigits`,
  `callbackUrl` (where the captured digit is POSTed back).

The captured keypress returns to your `callbackUrl` as a **`dtmf`** field on the
POST body. Identity is still the caller's **phone number** — same as USSD.

```xml
<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <GetDigits timeout="20" finishOnKey="#" numDigits="1"
             callbackUrl="https://YOUR_API/voice">
    <Play url="https://YOUR_CDN/audio/lang-select.mp3"/>
  </GetDigits>
</Response>
```
The `lang-select.mp3` clip says "English press 1, Twi press 2…" in a neutral
multilingual recording. Next request arrives with `dtmf` (1–4) → voice
controller stores the chosen language in the voice session, then responds with
the symptom menu clip for that language, again wrapped in `<GetDigits>`. After
the final keypress it calls `riskService.classify(...)`, then on HIGH/EMERGENCY
`escalationService.handle(...)` (dashboard alert + SMS), and responds per the
branch in §5.5: low/medium → `<Say>`/`<Play>` advice then end; high/emergency →
play a reassurance line then `<Dial>` the CHW. No `<GetDigits>` wrapper on the
last response = call ends after speaking.

### Language strategy → see §11
The big question — "can AT's TTS speak Twi/Dagbani/Ewe?" — is answered in §11.
Short version: **no, don't assume it can.** AT's `say` is English-centric. Voice
in the local languages uses **pre-recorded audio via `<Play>`**, not `<Say>`.
The voice controller picks the right clip set based on the caller's language
choice. Details, evidence, and the tiered plan are in §11.

### Files (when you build it)
```
controllers/voice.controller.ts   # sibling of ussd.controller — translator only
routes/voice.routes.ts            # POST /voice  (urlencoded body, returns XML)
services/voice-session.service.ts # in-memory Map<sessionId,{lang,step,data}> — mirrors ussd-session
utils/voice-xml.ts                # tiny helpers: say(), getDigits(), buildResponse()
```
Reuse the in-memory session pattern from USSD. Set `Content-Type: text/xml` (or
`application/xml`) on the response.

### Why it's Phase 3, not now
- Needs a **live virtual number** — AT historically has no voice sandbox, so you
  test against a live account (unlike USSD, which simulates cleanly offline).
  This is the main reason it can't be your demo backbone.
- Highest fragility (real telephony, real number, real network on stage).
- BUT: because it's just another controller over shared services, leaving the
  seam open costs nothing now. If Phase 1 + 2 finish early, a working Twi voice
  call is a showstopper. If not, you've lost nothing.

---

## 9. Build order (auth first, per your priority)

1. **Boot skeleton** — `env.ts` (validate+fail-fast), `prisma.ts`, `app.ts`,
   `server.ts`, error + 404 middleware. Confirm `GET /api/health` returns 200.
2. **Prisma schema + migrate** — `User` + `Role` enum (`PATIENT CHW DHO ADMIN`).
   `seed.ts` creates a demo CHW, DHO, and ADMIN.
3. **Auth slice** — `password.ts` (bcrypt), `jwt.ts`, `auth.service`,
   `auth.controller`, `auth.middleware`, `role.middleware`, routes. Test
   register/login/me end to end.
4. **Patient slice** — `findOrCreateByPhone` + profile create/list/detail.
   This is what web signup, USSD, and voice all lean on.
5. **Risk slice** — `risk.service` rule table + `RiskResult` (4 levels),
   `risk.controller`, `POST /api/risk/check`. Localized templates per §11.
6. **Alert + escalation slice** — `alert.service.raise/list/resolve` + routes,
   then `escalation.service.handle()` that wraps alert + SMS (and produces
   `bridgeToNumbers` for voice). Wire `escalate` from risk into it (HIGH +
   EMERGENCY escalate). Web + USSD consume the silent part now.
7. **USSD slice** — `ussd-session.service` (Map), `ussd.controller`,
   `ussd.routes` with urlencoded body parser. Build the simulator. Localized.
   Calls `escalationService.handle(..., { channel: 'ussd' })`.
8. **Notifications** — `notification.service` simulated send + dashboard panel.
9. **Voice / IVR** *(Phase 3 — only if 1–8 are solid and demoed)* —
   `voice-session.service` (Map), `voice.controller`, `voice.routes` returning
   XML, `voice-xml.ts` helpers (incl. `Dial()`). Local-language prompts =
   pre-recorded `<Play>` clips (§11); English = `<Say>`. High/emergency =
   speak-then-`<Dial>` to `bridgeToNumbers` (env-configurable; point at a
   teammate's phone for the demo). Launch English + Twi first.

Auth (steps 1-3) is the immediate focus. Voice (step 9) is gated behind
everything else.

---

## 10. Guardrails (from the playbook)

- No microservices, no premature abstractions, no Docker orchestration for the
  hackathon. One Express app, one Postgres, one repo.
- Typed everywhere it pays off (auth, risk, DTOs). Validate all input with zod
  at the controller boundary.
- Secure-by-default: bcrypt passwords, JWT secret from env (never committed),
  helmet + cors, role checks on every staff route.
- Preserve working features; inspect before editing; explain before large
  changes.
- AI assists and classifies — it never claims medical certainty or replaces a
  clinician.

---

## 11. Multilingual reality — the four languages, per channel

AfiaCare advertises **English, Twi, Dagbani, Ewe**. The cost of supporting a
language is wildly different by channel. Treat text and voice separately.

### 11.1 Golden rule
**Language is a presentation concern, never a logic concern.** The risk decision
(`level`, `reasons`, `escalate`) is computed from symptom flags alone and is
identical in every language. Only the *rendered string* changes. So localization
lives in lookup tables / clip sets at the channel edge — never in `riskService`.

### 11.2 Text channels (web + USSD) — cheap, do all four
Text in four languages = translation strings. Keep a simple table:

```ts
// e.g. services/i18n.ts  (or JSON files per language)
const STRINGS = {
  en: { menu_symptoms: 'Select your symptom', risk_high: 'Please go to a clinic now.' /* … */ },
  tw: { menu_symptoms: 'Paw nsɛnkyerɛnne a wowɔ', risk_high: '…' },
  dag:{ /* … */ },
  ee: { /* … */ },
};
```
- Web: the Vercel frontend already does its own i18n for UI chrome; the backend
  only needs to return the localized `recommendation` (pass `lang` in the
  request, render the template). Keep API error messages in English (developer-
  facing) and user-facing content localized.
- USSD: the `ussd.controller` looks up menu + result strings by the session's
  chosen language. First menu screen is the language picker.
- **Get native-speaker review of medical strings.** A mistranslated danger-sign
  instruction is a real-world harm, not a cosmetic bug. Don't ship
  machine-translated medical advice unreviewed.

### 11.3 Voice channel — the constrained one (evidence-based)
**Finding:** AT's built-in `say` (TTS) is English-centric. Its documented
controls are rate/pitch/volume; it does NOT advertise a language/locale selector
or Twi/Dagbani/Ewe voices (contrast Twilio, which documents per-locale voice
tables). Akan/Ewe/Dagbani are **tonal** languages — feeding their text to an
English TTS yields unintelligible output, because tone carries meaning. Academic
work treats Akan TTS as its own hard problem needing a custom phone set.

**Therefore: do NOT rely on AT TTS for local-language voice.** Tiered plan:

- **Tier 1 — pre-recorded `<Play>` clips (BUILD THIS FIRST).** The IVR script is
  a *fixed* set of phrases (language picker, symptom menu, the per-level result
  templates). ~15–25 short clips per language. Record once — Abena AI/Mobobi can
  generate them, or (cheaper + more authentic for a hackathon) record a native
  speaker on a phone mic. Host as MP3s, serve with `<Play url="...">`. Natural,
  rock-solid live, works for ALL four including Dagbani. Limitation: can't speak
  a truly dynamic sentence (e.g. a specific name) — fine, the script is fixed.
- **Tier 2 — third-party TTS API behind a seam.** If you want dynamic
  local-language speech later, put it behind `voiceService.synthesize(text,
  lang)`. Abena AI (Ghanaian, Mobobi) explicitly supports Twi + Ewe TTS;
  generate an audio file, then `<Play>` it. Dagbani may lack coverage → fall
  back to pre-recorded or English.
- **Tier 3 — AT `<Say>` for English only.** Any English dynamic text is fine.

### 11.4 Recommended launch scope (honest for judges)
- **Text (web + USSD): all four languages.** Cheap, high impact.
- **Voice: launch English + Twi** (highest coverage + your largest audience),
  with Dagbani/Ewe voice as "coming soon" but their *text* paths live on USSD.
- Four half-working voice languages reads worse than two solid ones plus a clear
  roadmap. Scope the demo to what's reliable; pitch the rest as the plan.

### 11.5 Action item before relying on anything
Verify in the AT dashboard which (if any) non-English voices `say` exposes, and
spin up an Abena AI trial to confirm Twi/Ewe/Dagbani TTS quality. Decide Tier 1
vs Tier 2 from real audio, not assumptions. Either way, the `<Play>`-first design
means this decision never blocks the rest of the build.
