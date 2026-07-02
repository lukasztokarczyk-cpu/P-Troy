/* =====================================================================
   ERP Elektryk — wspólna logika statycznej wersji demo
   Cała "baza danych" żyje w localStorage przeglądarki — nie ma
   backendu. To wersja demonstracyjna/UI-showcase do hostowania
   na GitHub Pages (czysto statyczny hosting, bez serwera Node).
   ===================================================================== */

const STORAGE_KEYS = {
  session: 'erp_session',
  events: 'erp_schedule_events',
  tasks: 'erp_tasks',
};

// ---- Sesja (mock — demo, bez prawdziwej autoryzacji) ----

const DEMO_ACCOUNT = { login: 'admin', password: 'admin123' };

function getSession() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEYS.session) || 'null');
  } catch {
    return null;
  }
}

function setSession(user) {
  localStorage.setItem(STORAGE_KEYS.session, JSON.stringify(user));
}

function clearSession() {
  localStorage.removeItem(STORAGE_KEYS.session);
}

// Wywołaj na początku każdej strony panelu — przekierowuje na /index.html,
// jeśli nie ma aktywnej "sesji"
function requireAuth() {
  const session = getSession();
  if (!session) {
    window.location.href = 'index.html';
    return null;
  }
  return session;
}

function logout() {
  clearSession();
  window.location.href = 'index.html';
}

// ---- Kafelki dashboardu ----

const TILES = [
  { key: 'schedule', name: 'Harmonogram', desc: 'Kalendarz i planowanie', icon: 'calendar-days', href: 'schedule.html', badge: 2 },
  { key: 'tasks', name: 'Zadania', desc: 'Tablica zadań', icon: 'list-checks', href: 'tasks.html', badge: 3 },
  { key: 'sites', name: 'Budowy', desc: 'Zarządzanie budowami', icon: 'hard-hat', href: 'module.html?name=Budowy', badge: 0 },
  { key: 'warehouse', name: 'Magazyn', desc: 'Stany i produkty', icon: 'warehouse', href: 'module.html?name=Magazyn', badge: 1 },
  { key: 'vehicles', name: 'Pojazdy', desc: 'Flota i wyposażenie', icon: 'truck', href: 'module.html?name=Pojazdy', badge: 0 },
  { key: 'measurements', name: 'Pomiary', desc: 'Protokoły pomiarowe', icon: 'gauge', href: 'module.html?name=Pomiary', badge: 0 },
  { key: 'time', name: 'Czas pracy', desc: 'Rejestracja godzin', icon: 'clock', href: 'module.html?name=Czas%20pracy', badge: 0 },
  { key: 'settings', name: 'Ustawienia', desc: 'Konfiguracja systemu', icon: 'settings', href: 'module.html?name=Ustawienia', badge: 0 },
];

// ---- Wspólny górny pasek — renderowany na każdej stronie panelu ----

function renderTopbar(containerId = 'topbar') {
  const session = getSession();
  if (!session) return;

  const el = document.getElementById(containerId);
  if (!el) return;

  const initials = (session.firstName?.[0] || '') + (session.lastName?.[0] || '');

  el.innerHTML = `
    <a href="dashboard.html" class="topbar-logo">
      <span class="logo-badge" id="topbarLogoBadge"><svg data-lucide="zap"></svg></span>
      <span>ERP Elektryk</span>
    </a>
    <div class="search-wrap">
      <svg data-lucide="search"></svg>
      <input placeholder="Szukaj budów, zadań, produktów..." />
    </div>
    <div class="topbar-actions">
      <button class="icon-btn" title="Powiadomienia">
        <svg data-lucide="bell"></svg>
        <span class="badge-dot">3</span>
      </button>
      <div style="position:relative">
        <button class="profile-btn" id="profileBtn">
          <span class="avatar-circle">${initials || 'U'}</span>
          <span class="profile-name">${session.firstName} ${session.lastName}</span>
          <svg data-lucide="chevron-down" style="width:14px;height:14px;color:var(--text-dim)"></svg>
        </button>
        <div class="profile-menu" id="profileMenu">
          <a href="module.html?name=Mój%20profil"><svg data-lucide="user" style="width:14px;height:14px"></svg> Mój profil</a>
          <a href="module.html?name=Ustawienia"><svg data-lucide="settings" style="width:14px;height:14px"></svg> Ustawienia</a>
          <button class="logout" onclick="logout()"><svg data-lucide="log-out" style="width:14px;height:14px"></svg> Wyloguj się</button>
        </div>
      </div>
    </div>
  `;

  document.getElementById('profileBtn').addEventListener('click', () => {
    document.getElementById('profileMenu').classList.toggle('open');
  });
  document.addEventListener('click', (e) => {
    const menu = document.getElementById('profileMenu');
    const btn = document.getElementById('profileBtn');
    if (menu && !menu.contains(e.target) && !btn.contains(e.target)) menu.classList.remove('open');
  });

  applyLogo();
  if (window.lucide) lucide.createIcons();
}

// ---- Logo — wgraj plik jako assets/img/logo.png (lub .svg) i podmień
// tę jedną funkcję nie jest nawet konieczne: jeśli plik istnieje pod
// tą ścieżką, zostanie automatycznie wykryty i użyty zamiast ikony ⚡ ----

function applyLogo() {
  const candidates = ['assets/img/logo.png', 'assets/img/logo.svg', 'assets/img/logo.jpg'];
  const targets = document.querySelectorAll('#topbarLogoBadge, .login-logo');

  tryNextCandidate(candidates, 0, targets);
}

function tryNextCandidate(candidates, index, targets) {
  if (index >= candidates.length) return; // brak wgranego logo — zostaje domyślna ikona
  const img = new Image();
  img.onload = () => {
    targets.forEach((t) => {
      t.innerHTML = `<img src="${candidates[index]}" alt="Logo firmy" />`;
    });
  };
  img.onerror = () => tryNextCandidate(candidates, index + 1, targets);
  img.src = candidates[index];
}

// ---- Toast ----

function showToast(message) {
  const existing = document.querySelector('.toast');
  if (existing) existing.remove();
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.textContent = message;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 2600);
}

document.addEventListener('DOMContentLoaded', applyLogo);
