# Wdrożenie na GitHub Pages (za darmo)

Ten folder (`static-site/`) to samodzielna, w pełni statyczna strona —
czysty HTML/CSS/JS, zero build stepu, zero backendu. Działa od razu po
wrzuceniu na GitHub Pages.

## Krok po kroku

1. Załóż nowe, **publiczne** repozytorium na GitHub, np. `erp-elektryk-demo`.
2. Wgraj do niego **zawartość tego folderu** (`static-site/`) tak, żeby
   `index.html` leżał w korzeniu repozytorium (nie w podfolderze).
   ```bash
   cd static-site
   git init
   git add .
   git commit -m "ERP Elektryk — wersja demo"
   git branch -M main
   git remote add origin https://github.com/TWOJA-NAZWA/erp-elektryk-demo.git
   git push -u origin main
   ```
3. Na GitHub: **Settings → Pages → Source** → wybierz branch `main` i
   folder `/ (root)` → **Save**.
4. Po ok. minucie strona będzie dostępna pod:
   `https://TWOJA-NAZWA.github.io/erp-elektryk-demo/`

Gotowe — logowanie, dashboard, Harmonogram i Zadania działają od razu
(dane trzymane lokalnie w przeglądarce odwiedzającego, w `localStorage`).

## Podmiana logo

Wgraj swój plik jako `assets/img/logo.png` (zastąp istniejący plik —
usuń stary lub nadpisz go tą samą nazwą). Strona **automatycznie** go
wykryje i użyje zarówno na stronie logowania, jak i w górnym pasku —
nie trzeba nic zmieniać w kodzie. Obsługiwane formaty: `.png`, `.svg`, `.jpg`
(w tej kolejności pierwszeństwa) pod nazwą `logo.*`.

## Dane logowania (demo)

- Login: `admin`
- Hasło: `admin123`

To WYŁĄCZNIE demonstracja interfejsu — logowanie jest sprawdzane w
przeglądarce (JavaScript), bez prawdziwego backendu. Nie używaj tej
wersji do przechowywania prawdziwych danych firmowych.

## Co jest w pełni funkcjonalne w tej wersji demo

- ✅ Logowanie / wylogowanie (sesja w `localStorage`)
- ✅ Dashboard z kafelkami (responsywny, animacje)
- ✅ Harmonogram — pełny widok miesiąca, dodawanie wydarzeń
- ✅ Zadania — tablica Kanban z Drag & Drop między statusami
- ⏳ Pozostałe kafelki (Budowy, Magazyn, Pojazdy, Pomiary, Czas pracy,
  Ustawienia) pokazują ekran "moduł w budowie" — ich **pełna,
  produkcyjna implementacja** (backend NestJS + baza PostgreSQL +
  frontend Next.js) znajduje się w folderach `backend/` i `frontend/`
  w głównym repozytorium i wymaga hostingu z obsługą Node.js
  (np. Railway, Render, VPS) — GitHub Pages nie uruchamia serwerów.

## Chcesz mieć PEŁNY system (z bazą danych) też za darmo?

GitHub Pages nie wystarczy (obsługuje tylko pliki statyczne). Darmowe
opcje z obsługą Node.js + PostgreSQL, które udźwigną folder `backend/`
i `frontend/` z głównego repo:
- **Railway** (darmowy plan startowy, PostgreSQL wbudowany)
- **Render** (darmowy plan dla web service + PostgreSQL)
- **Fly.io** (darmowy plan startowy)

Powiedz, jeśli chcesz, żebym przygotował konfigurację wdrożenia pod
konkretnie jedną z tych platform.
