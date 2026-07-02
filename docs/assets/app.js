/**
 * ERP Elektryk — statyczna wersja demonstracyjna (GitHub Pages).
 * ------------------------------------------------------------------
 * WAŻNE: to jest wyłącznie warstwa frontendowa działająca w 100%
 * w przeglądarce (localStorage jako "baza danych"). Nie ma tu
 * prawdziwego serwera, bazy PostgreSQL ani autoryzacji JWT — to
 * wersja do zaprezentowania wyglądu i przepływu UI. Pełny, produkcyjny
 * system (NestJS + Prisma + PostgreSQL + MinIO) znajduje się w folderach
 * backend/ i frontend/ w tym repozytorium i wymaga hostingu z bazą
 * danych (patrz README-github-pages.md).
 */

const STORAGE_KEYS = {
  session: 'erp_demo_session',
  logo: 'erp_demo_logo',
  companyName: 'erp_demo_company_name',
};

const DEMO_USER = {
  login: 'admin',
  password: 'admin123',
  firstName: 'Jan',
  lastName: 'Kowalski',
  role: 'Administrator',
};

const TILES = [
  { key: 'schedule', name: 'Harmonogram', desc: 'Kalendarz i planowanie', icon: 'calendar', color: '#f97316', badge: 3, href: 'schedule.html' },
  { key: 'tasks', name: 'Zadania', desc: 'Tablica Kanban', icon: 'check-square', color: '#38bdf8', badge: 5, href: '#' },
  { key: 'sites', name: 'Budowy', desc: 'Realizacje i dokumentacja', icon: 'hard-hat', color: '#facc15', badge: 0, href: '#' },
  { key: 'warehouse', name: 'Magazyn', desc: 'Stany i produkty', icon: 'warehouse', color: '#4ade80', badge: 2, href: '#' },
  { key: 'vehicles', name: 'Pojazdy', desc: 'Flota i wyposażenie', icon: 'truck', color: '#a78bfa', badge: 1, href: '#' },
  { key: 'measurements', name: 'Pomiary', desc: 'Protokoły pomiarowe', icon: 'gauge', color: '#2dd4bf', badge: 0, href: '#' },
  { key: 'time', name: 'Czas pracy', desc: 'Rejestracja godzin', icon: 'clock', color: '#fb7185', badge: 0, href: '#' },
  { key: 'settings', name: 'Ustawienia', desc: 'Konfiguracja systemu', icon: 'settings', color: '#94a3b8', badge: 0, href: 'settings.html' },
];

// ---- Ikony (minimalny inline SVG set — bez zewnętrznych zależności) ----
const ICONS = {
  bolt: '<path d="M13 2 3 14h7l-1 8 11-14h-7l1-6z"/>',
  user: '<path d="M20 21a8 8 0 1 0-16 0"/><circle cx="12" cy="7" r="4"/>',
  lock: '<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/>',
  bell: '<path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/>',
  chevronDown: '<path d="m6 9 6 6 6-6"/>',
  logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>',
  calendar: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
  'check-square': '<polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>',
  'hard-hat': '<path d="M2 18a1 1 0 0 0 1 1h18a1 1 0 0 0 1-1 6 6 0 0 0-6-6h-.5a4 4 0 0 0-3.9-3.1V6a1 1 0 0 0-2 0v2.9A4 4 0 0 0 8.5 12H8a6 6 0 0 0-6 6z"/><path d="M10 10V6a2 2 0 0 1 4 0v4"/>',
  warehouse: '<path d="M22 8.35V20a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V8.35a1 1 0 0 1 .53-.88l9-4.78a1 1 0 0 1 .94 0l9 4.78a1 1 0 0 1 .53.88Z"/><path d="M6 21v-8h12v8"/>',
  truck: '<path d="M10 17h4V5H2v12h3"/><path d="M20 17h2v-3.34a4 4 0 0 0-1.17-2.83L19 9h-5v8h1"/><circle cx="7.5" cy="17.5" r="2.5"/><circle cx="17.5" cy="17.5" r="2.5"/>',
  gauge: '<path d="m12 14 4-4"/><path d="M3.34 19a10 10 0 1 1 17.32 0"/>',
  clock: '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
  upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>',
  check: '<polyline points="20 6 9 17 4 12"/>',
  plus: '<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>',
  chevronLeft: '<polyline points="15 18 9 12 15 6"/>',
  chevronRight: '<polyline points="9 18 15 12 9 6"/>',
};

function icon(name, size = 18) {
  const path = ICONS[name] || ICONS.bolt;
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${path}</svg>`;
}

// ---- Sesja (mock) ----
function getSession() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEYS.session)); } catch { return null; }
}

function requireAuth() {
  const session = getSession();
  if (!session) window.location.href = 'index.html';
  return session;
}

function login(loginValue, password) {
  if (loginValue === DEMO_USER.login && password === DEMO_USER.password) {
    localStorage.setItem(STORAGE_KEYS.session, JSON.stringify(DEMO_USER));
    return true;
  }
  return false;
}

function logout() {
  localStorage.removeItem(STORAGE_KEYS.session);
  window.location.href = 'index.html';
}

// ---- Logo firmy ----
function getLogo() { return localStorage.getItem(STORAGE_KEYS.logo); }
function setLogo(dataUrl) { localStorage.setItem(STORAGE_KEYS.logo, dataUrl); }
function getCompanyName() { return localStorage.getItem(STORAGE_KEYS.companyName) || 'ERP Elektryk'; }
function setCompanyName(name) { localStorage.setItem(STORAGE_KEYS.companyName, name); }

function applyBranding() {
  const logo = getLogo();
  document.querySelectorAll('.logo-slot').forEach((slot) => {
    slot.innerHTML = logo ? `<img src="${logo}" alt="Logo firmy" />` : icon('bolt', slot.classList.contains('topbar-logo') ? 18 : 26);
  });
  document.querySelectorAll('.js-company-name').forEach((el) => { el.textContent = getCompanyName(); });
  document.title = `${getCompanyName()} — Panel`;
}

// ---- Toast ----
function toast(message) {
  let el = document.querySelector('.toast');
  if (!el) {
    el = document.createElement('div');
    el.className = 'toast';
    document.body.appendChild(el);
  }
  el.textContent = message;
  el.classList.add('show');
  clearTimeout(el._t);
  el._t = setTimeout(() => el.classList.remove('show'), 2500);
}

// ---- Render top bar (wspólny dla wszystkich stron panelu) ----
function renderTopBar(containerId = 'topbar') {
  const session = getSession();
  if (!session) return;

  const container = document.getElementById(containerId);
  if (!container) return;

  container.innerHTML = `
    <a href="dashboard.html" class="topbar-logo">
      <div class="logo-slot"></div>
      <span class="js-company-name">ERP Elektryk</span>
    </a>
    <div class="search-box">
      ${icon('search', 15)}
      <input placeholder="Szukaj budów, zadań, produktów..." />
    </div>
    <div class="topbar-actions">
      <button class="icon-btn" title="Powiadomienia">
        ${icon('bell', 17)}
        <span class="badge">5</span>
      </button>
      <div style="position:relative">
        <button class="profile-btn" id="profileBtn">
          <div class="avatar">${session.firstName[0]}${session.lastName[0]}</div>
          <span class="profile-name">${session.firstName} ${session.lastName}</span>
          ${icon('chevronDown', 14)}
        </button>
        <div class="dropdown" id="profileDropdown">
          <a href="settings.html">${icon('settings', 15)} Ustawienia</a>
          <button id="logoutBtn" class="danger">${icon('logout', 15)} Wyloguj się</button>
        </div>
      </div>
    </div>
  `;

  document.getElementById('profileBtn').addEventListener('click', () => {
    document.getElementById('profileDropdown').classList.toggle('open');
  });
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.profile-btn') && !e.target.closest('.dropdown')) {
      document.getElementById('profileDropdown')?.classList.remove('open');
    }
  });
  document.getElementById('logoutBtn').addEventListener('click', logout);

  applyBranding();
}
