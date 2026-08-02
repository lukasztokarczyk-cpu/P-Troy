import { PrismaClient, Role } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

// Domyślne kafelki dashboardu — odpowiadają modułom opisanym w specyfikacji.
// isSystem=true, żeby administrator nie mógł ich przypadkowo usunąć
// (może je wyłączyć, ale nie skasować bez śladu).
const DEFAULT_TILES = [
  { key: 'schedule', name: 'Harmonogram', icon: 'CalendarDays', route: '/schedule', color: '#f97316' },
  { key: 'tasks', name: 'Zadania', icon: 'ListChecks', route: '/tasks', color: '#f97316' },
  { key: 'sites', name: 'Budowy', icon: 'HardHat', route: '/sites', color: '#f97316' },
  { key: 'warehouse', name: 'Magazyn', icon: 'Warehouse', route: '/warehouse', color: '#f97316' },
  { key: 'vehicles', name: 'Pojazdy', icon: 'Truck', route: '/vehicles', color: '#f97316' },
  { key: 'measurements', name: 'Pomiary', icon: 'Gauge', route: '/measurements', color: '#f97316' },
  { key: 'time-tracking', name: 'Czas pracy', icon: 'Clock', route: '/time-tracking', color: '#f97316' },
  { key: 'assets', name: 'Sprzęt', icon: 'Wrench', route: '/assets', color: '#f97316' },
  { key: 'settings', name: 'Ustawienia', icon: 'Settings', route: '/settings', color: '#f97316' },
];

// Domyślne kategorie i statusy sprzętu — administrator może dodawać
// kolejne z poziomu aplikacji (patrz specyfikacja modułu "Sprzęt")
const DEFAULT_ASSET_CATEGORIES = [
  'Elektronarzędzia', 'Mierniki', 'Rusztowania', 'Drabiny',
  'Narzędzia ręczne', 'Samochody', 'Sprzęt BHP', 'Komputery', 'Telefony',
];
const DEFAULT_ASSET_STATUSES: { name: string; color: string }[] = [
  { name: 'Dostępny', color: '#22c55e' },
  { name: 'U instalatora', color: '#3b82f6' },
  { name: 'W magazynie', color: '#71717a' },
  { name: 'Wypożyczony', color: '#eab308' },
  { name: 'Uszkodzony', color: '#ef4444' },
  { name: 'Do naprawy', color: '#f97316' },
  { name: 'W serwisie', color: '#f97316' },
  { name: 'Wycofany z użytkowania', color: '#71717a' },
];

async function main() {
  console.log('Seedowanie bazy danych...');

  for (const [index, tile] of DEFAULT_TILES.entries()) {
    await prisma.dashboardModule.upsert({
      where: { key: tile.key },
      update: {},
      create: { ...tile, order: index, isSystem: true },
    });
  }

  for (const name of DEFAULT_ASSET_CATEGORIES) {
    await prisma.assetCategory.upsert({ where: { name }, update: {}, create: { name } });
  }
  for (const status of DEFAULT_ASSET_STATUSES) {
    await prisma.assetStatus.upsert({ where: { name: status.name }, update: {}, create: status });
  }

  const adminPassword = process.env.SEED_ADMIN_PASSWORD || 'ZmienToHaslo123!';
  const passwordHash = await bcrypt.hash(adminPassword, 12);

  await prisma.user.upsert({
    where: { login: 'admin' },
    update: {},
    create: {
      login: 'admin',
      email: 'admin@erp-elektryk.local',
      passwordHash,
      firstName: 'Administrator',
      lastName: 'Systemu',
      role: Role.ADMIN,
    },
  });

  console.log('Utworzono konto administratora: login "admin".');
  console.log('USTAW ZMIENNĄ SEED_ADMIN_PASSWORD PRZED WDROŻENIEM PRODUKCYJNYM.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
