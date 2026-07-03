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

## Konta demo i widoczność danych

- **Administrator**: login `admin`, hasło `admin123` — widzi wszystko, przypisuje instalatorów do budów/zadań/wydarzeń/pojazdów.
- **Instalatorzy**: `pwisniewski`, `azielinska`, `tkowalczyk` — hasło `haslo123` dla każdego —
  widzą **wyłącznie zadania i wydarzenia w kalendarzu, do których zostali przypisani**.
  Administrator klikając odznakę instalatora w Zadaniach/Budowach przechodzi do
  podglądu jego osobistego kalendarza (`schedule.html?installer=ID`).

## Co jest w pełni funkcjonalne w tej wersji demo

- ✅ Logowanie wieloosobowe (Administrator + 3 konta Instalatorów) z realnie
  różną widocznością danych per rola
- ✅ Dashboard z kafelkami (responsywny, animacje)
- ✅ Harmonogram — widok miesiąca, wydarzenia z przypisanymi instalatorami,
  filtrowanie widoczności, podgląd kalendarza konkretnej osoby (dla admina)
- ✅ Zadania — Kanban z Drag & Drop, przypisanie do budowy i wielu instalatorów,
  instalator widzi tylko własne zadania
- ✅ Budowy — lista, filtrowanie po statusie, przypisanie wielu instalatorów
- ✅ Magazyn — tabela produktów, wyszukiwanie, korekta stanów, alarm niskiego stanu
- ✅ Pojazdy — przypisanie do instalatora na stałe albo w konkretnym zakresie dat
  (także jednodniowe), automatyczne wyliczanie aktualnego przypisania
- ✅ Pomiary — protokoły przypisane do budów, załączanie zdjęć w pełnej
  rozdzielczości (zapis lokalny w przeglądarce jako base64), podgląd w nowej karcie
- ✅ Czas pracy — licznik start/stop w czasie rzeczywistym **oraz** ręczne
  wpisywanie godzin (np. „dziś od 7 do 17"), wybór budowy domyślnie ustawiany
  na tę, do której instalator jest przypisany, ze możliwością zmiany
- ✅ Ustawienia — dane firmy, powiadomienia, lista użytkowników (tylko Administrator)

Wszystkie moduły zapisują dane w `localStorage` przeglądarki odwiedzającego —
to w pełni interaktywne demo UI, ale bez współdzielonej bazy danych między
użytkownikami (każda przeglądarka ma własne, niezależne dane). Pełna,
wieloużytkownikowa wersja produkcyjna (z bazą PostgreSQL, prawdziwym JWT
i wspólnymi danymi dla wszystkich) znajduje się w folderach `backend/`
i `frontend/` głównego repozytorium.

## Chcesz mieć PEŁNY system (z bazą danych) też za darmo?

GitHub Pages nie wystarczy (obsługuje tylko pliki statyczne). Darmowe
opcje z obsługą Node.js + PostgreSQL, które udźwigną folder `backend/`
i `frontend/` z głównego repo:
- **Railway** (darmowy plan startowy, PostgreSQL wbudowany)
- **Render** (darmowy plan dla web service + PostgreSQL)
- **Fly.io** (darmowy plan startowy)

Powiedz, jeśli chcesz, żebym przygotował konfigurację wdrożenia pod
konkretnie jedną z tych platform.
