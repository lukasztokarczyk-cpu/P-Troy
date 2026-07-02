# Wdrożenie na GitHub Pages (za darmo)

Ten folder (`docs/`) to **samodzielna, statyczna wersja demonstracyjna**
frontendu — działa w 100% w przeglądarce, bez żadnego serwera ani bazy
danych. Nadaje się idealnie na darmowy hosting typu GitHub Pages.

**Czego NIE zawiera** (bo GitHub Pages nie hostuje backendu):
prawdziwej autoryzacji, bazy danych, przechowywania plików, powiadomień
Push z serwera, WebSocket. Logowanie i zapis logo działają lokalnie
w przeglądarce (`localStorage`) — to warstwa prezentacyjna UI, nie
produkcyjny system. Pełny system (z bazą danych) jest w folderach
`backend/` i `frontend/` w głównym repozytorium — wymaga hostingu
z obsługą Node.js + PostgreSQL (patrz `README.md` w głównym katalogu,
sekcja "darmowe opcje hostingu pełnego systemu" poniżej).

## Krok po kroku

1. **Załóż darmowe konto na GitHub** (jeśli jeszcze nie masz): https://github.com/join

2. **Utwórz nowe, puste repozytorium**, np. `erp-elektryk`
   (Public — GitHub Pages za darmo wymaga publicznego repo,
   chyba że masz plan GitHub Pro).

3. **Wgraj cały ten projekt do repozytorium.** Najprościej przez przeglądarkę:
   - Otwórz swoje repozytorium na GitHub
   - "Add file" → "Upload files"
   - Przeciągnij CAŁĄ zawartość folderu projektu (w tym folder `docs/`)
   - Kliknij "Commit changes"

   Albo przez terminal (jeśli masz zainstalowany git):
   ```bash
   cd erp-elektryk
   git init
   git add .
   git commit -m "Pierwsza wersja ERP Elektryk"
   git branch -M main
   git remote add origin https://github.com/TWOJA-NAZWA/erp-elektryk.git
   git push -u origin main
   ```

4. **Włącz GitHub Pages:**
   - Wejdź w swoje repozytorium → **Settings** → **Pages** (menu po lewej)
   - W sekcji "Build and deployment" → "Source" wybierz **Deploy from a branch**
   - Branch: **main**, folder: **/docs**
   - Kliknij **Save**

5. **Poczekaj 1-2 minuty.** GitHub pokaże link, pod którym strona jest
   dostępna — zwykle:
   ```
   https://TWOJA-NAZWA.github.io/erp-elektryk/
   ```

6. **Gotowe.** Otwórz link — zobaczysz stronę logowania.
   Zaloguj się: **login `admin`**, **hasło `admin123`**.

## Wgrywanie logo

Wejdź w **Ustawienia** (kafelek na dashboardzie) albo kliknij bezpośrednio
w miejsce logo na stronie logowania — logo zapisze się w przeglądarce
i pojawi się automatycznie na stronie logowania oraz w górnym pasku.

> Uwaga: logo wgrane w ten sposób jest zapisane lokalnie w Twojej
> przeglądarce (localStorage), więc będzie widoczne tylko na Twoim
> urządzeniu/przeglądarce — inni odwiedzający zobaczą domyślną ikonę,
> dopóki sami nie wgrają swojego pliku. Żeby logo było widoczne dla
> WSZYSTKICH odwiedzających stronę, podmień plik `favicon.svg` w tym
> folderze na własne logo (w formacie SVG) i zrób commit — wtedy jest
> ono częścią strony, a nie tylko Twojej przeglądarki.

## Aktualizacja strony w przyszłości

Każda zmiana plików w folderze `docs/` i wypchnięcie jej na branch `main`
(przez upload w przeglądarce albo `git push`) automatycznie zaktualizuje
opublikowaną stronę w ciągu minuty — nie trzeba nic dodatkowo klikać.

## Darmowe opcje hostingu PEŁNEGO systemu (z backendem i bazą danych)

Kiedy będziesz gotów wdrożyć prawdziwy, produkcyjny system (foldery
`backend/` i `frontend/` z głównego repozytorium), GitHub Pages nie
wystarczy — potrzebujesz hostingu, który uruchamia kod serwerowy
i bazę danych. Darmowe (na start) opcje:

| Co | Darmowa usługa | Uwagi |
|---|---|---|
| Frontend (Next.js) | **Vercel** | Darmowy plan wystarcza w zupełności na start |
| Backend (NestJS) | **Render.com** (free web service) lub **Railway.app** | Darmowy plan usypia serwer po czasie bezczynności |
| Baza danych PostgreSQL | **Neon.tech** lub **Supabase** | Darmowy plan z limitem miejsca, w zupełności wystarczający na start |
| Przechowywanie plików (zdjęcia) | **Cloudflare R2** (darmowy limit) zamiast własnego MinIO | Kompatybilne z S3, ten sam kod (`FileStorageService`) |

Daj znać, jeśli chcesz, żebym przygotował gotową konfigurację
(`render.yaml` / `vercel.json`) pod ten zestaw — mogę to zrobić w kolejnym kroku.
