# ERP Elektryk — pełny system

Kompletny, gotowy do wdrożenia system ERP dla firmy elektrycznej.
Next.js 14 (App Router) + NestJS + PostgreSQL/Prisma + MinIO + WebSocket.

## Szybki start (Docker)

```bash
cp .env.example .env
# uzupełnij JWT_ACCESS_SECRET / JWT_REFRESH_SECRET losowymi wartościami, np.:
#   openssl rand -hex 64

docker compose up --build
```

- Frontend: http://localhost:3000
- Backend API: http://localhost:4000
- MinIO Console: http://localhost:9001 (minioadmin / minioadmin)

Domyślne konto administratora tworzone przez seed: **login `admin`**,
hasło z `SEED_ADMIN_PASSWORD` w `.env` (zmień przed produkcją!).

## Rozwój lokalny (bez Dockera)

```bash
# Backend
cd backend
npm install
npx prisma generate
npx prisma migrate dev
npx prisma db seed
npm run start:dev

# Frontend (w drugim terminalu)
cd frontend
npm install
npm run dev
```

## Struktura repozytorium

```
prisma/schema.prisma        — jeden, spójny schemat całej bazy danych
prisma/seed.ts               — domyślne kafelki + konto administratora
backend/src/common/          — infrastruktura współdzielona (Prisma, JWT,
                                WebSocket, mail, storage, PDF, etykiety, audyt)
backend/src/modules/         — jeden folder = jeden kafelek/moduł biznesowy:
  auth, users, notifications, audit-log, admin-tiles, settings,
  schedule, tasks, signatures, inventory-codes,
  sites, warehouse, vehicles, measurements, time-tracking
frontend/app/                — trasy Next.js (login, dashboard, moduły)
frontend/components/         — komponenty UI (layout, ui/, moduły biznesowe)
frontend/lib/                — klient API, kontekst autoryzacji, typy
docker-compose.yml           — Postgres + MinIO + backend + frontend
```

## Dodawanie nowego modułu/kafelka w przyszłości

1. Backend: `nest g module modules/nazwa-modulu`, dodaj serwis/kontroler/DTO,
   zaimportuj moduł w `app.module.ts`.
2. Baza: dopisz modele do `prisma/schema.prisma`, uruchom
   `npx prisma migrate dev --name nazwa_modulu`.
3. Dashboard: dodaj wpis do `DEFAULT_TILES` w `prisma/seed.ts` albo utwórz
   kafelek z panelu administratora (`POST /api/tiles`) — trafi na dashboard
   od razu, bez zmian w kodzie pozostałych modułów.
4. Frontend: dodaj trasę w `frontend/app/(dashboard)/nazwa-modulu/page.tsx`
   i komponenty w `frontend/components/nazwa-modulu/`.

Żaden z powyższych kroków nie wymaga modyfikacji istniejących modułów —
zgodnie z wymogiem rozbudowy systemu bez przebudowy.
