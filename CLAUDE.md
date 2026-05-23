# CLAUDE.md — AfiaCare Backend

This file is read automatically at the start of every Claude Code session. It is
the behavioral contract. The full technical design lives in
`docs/ARCHITECTURE.md` — **read it before writing any code.**

---

## What this project is

A unified maternal-health backend for AfiaCare (Ghana). ONE Express API serving
three channels over shared services and one PostgreSQL database:
- **Web** — REST/JSON, for the existing Next.js frontend (separate Vercel repo).
- **USSD** — `*928#`, Africa's Talking, `CON`/`END` text.
- **Voice / IVR** — Africa's Talking, XML (`Say`/`Play`/`Dial`).

**One backend, three endpoints — NOT three services.** Do not split into
microservices or multiple apps. See `docs/ARCHITECTURE.md §0`.

---

## Read these first, in order
1. `docs/ARCHITECTURE.md §0` — the one architectural rule (thin controllers,
   shared services) and "endpoints ≠ services."
2. `docs/ARCHITECTURE.md §9` — the build order. We are going in this order.
3. The section for whatever slice you're building.

Do not invent structure that contradicts the spec. If the spec is unclear or
seems wrong, say so and propose a change — don't silently diverge.

---

## Core rules (from the project playbook)

1. **Never overengineer.** Optimize for speed, stability, demo quality,
   maintainability. No unnecessary abstractions, no microservices, no premature
   optimization, no enterprise complexity.
2. **Explain before large changes.** Before a big edit: what's changing, why,
   which files, what dependencies. Keep it concise.
3. **Preserve working features.** Inspect existing code first. Don't break what
   works. Avoid unnecessary rewrites.
4. **Production-oriented output.** Clean, typed, modular, readable, secure by
   default. No placeholder/fake/pseudo-code unless explicitly asked.
5. **Think like a senior engineer.** Weigh tradeoffs; minimize tech debt.

---

## The non-negotiable architecture rule

**Business logic lives in `services/`. Controllers (web, USSD, voice) ONLY
translate** — they turn a request into a service call and the result into the
channel's response format. If you're writing `if (risk === 'HIGH')` inside a
controller, STOP — that belongs in a service.

- `riskService.classify()`, `escalationService.handle()`,
  `patientService.findOrCreateByPhone()` etc. are called identically by all
  channels. Never fork business logic per channel.

---

## Conventions

- **Language:** TypeScript, strict mode. Type things where it pays off (auth,
  risk, DTOs).
- **Validation:** zod at every controller boundary. Never trust input.
- **Errors:** throw the typed `ApiError`; the central error middleware formats
  the response. Don't scatter try/catch with ad-hoc JSON.
- **DB:** Prisma only. One `PrismaClient` instance from `config/prisma.ts`.
  Never instantiate `PrismaClient` per-request.
- **Secrets:** from `config/env.ts` (validated, fail-fast on boot). Never read
  `process.env` directly elsewhere. Never commit `.env`.
- **Security defaults:** bcrypt passwords, JWT from env, helmet + cors, role
  checks on every staff route.
- **Roles:** `PATIENT | CHW | DHO | ADMIN`. Only PATIENT is obtainable via
  public signup; CHW/DHO/ADMIN are seeded or invited.
- **AI/risk:** rule-based and deterministic. The AI never claims medical
  certainty and never replaces a clinician. Risk decision is language-neutral.

---

## Commands

```bash
npm run dev            # tsx watch — local dev server
npm run build          # tsc -> dist/
npm start              # run built server
npm run typecheck      # tsc --noEmit, no output
npm run prisma:migrate # prisma migrate dev
npm run prisma:generate
npm run db:seed        # seed CHW + DHO + ADMIN demo users
npm run prisma:studio  # inspect the DB
```

(These land as the boot skeleton + Prisma slices are built — keep this list in
sync as scripts are added.)

---

## Working agreement for this session

- Build strictly in the order in `docs/ARCHITECTURE.md §9`. Don't jump ahead.
- After each slice: confirm it runs (`npm run typecheck` + a quick manual test)
  before moving on.
- Specify exact file paths for everything you create or edit.
- Prefer small, reviewable commits with clear messages.
- When unsure, ask one focused question rather than guessing on something
  expensive to undo (schema shape, auth model, public API contract).
