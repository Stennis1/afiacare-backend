# AfiaCare Backend

Unified maternal-health backend for AfiaCare. One Express API serving three
channels — web (REST/JSON), USSD (`*928#`), and Voice/IVR — over shared
services and one PostgreSQL database.

See `docs/ARCHITECTURE.md` for the full design (the source of truth) and
`CLAUDE.md` for build conventions.

## Stack
Node + Express + TypeScript · Prisma + PostgreSQL · JWT auth · Africa's Talking.

## Status
🚧 Scaffolding. Build order per `docs/ARCHITECTURE.md §9` — auth slice first.
