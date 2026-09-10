'use client';

import { HelpCircle, Printer } from 'lucide-react';

function StepList({ items }: { items: string[] }) {
  return (
    <ol className="ml-1 list-decimal space-y-2 pl-5 text-sm text-zinc-300">
      {items.map((item, i) => <li key={i} dangerouslySetInnerHTML={{ __html: item }} />)}
    </ol>
  );
}

function Tip({ children }: { children: React.ReactNode }) {
  return (
    <div className="my-3 rounded-lg border border-orange-900/40 bg-orange-950/20 px-4 py-3 text-sm text-zinc-300">
      {children}
    </div>
  );
}

function Section({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <section className="mb-10">
      <h2 className="mb-4 flex items-center gap-2.5 border-b border-zinc-800 pb-2.5 text-lg font-semibold text-white">
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-orange-600 text-xs font-bold text-white">{n}</span>
        {title}
      </h2>
      {children}
    </section>
  );
}

export default function HelpPage() {
  return (
    <div className="mx-auto max-w-3xl p-4">
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <HelpCircle className="h-6 w-6 text-orange-500" />
          <h1 className="text-xl font-bold text-white">Instrukcja dla instalatora</h1>
        </div>
        <button onClick={() => window.print()} className="flex items-center gap-1.5 rounded-lg border border-zinc-700 px-3 py-1.5 text-xs text-zinc-300 hover:border-orange-600 hover:text-orange-500 print:hidden">
          <Printer className="h-3.5 w-3.5" /> Drukuj / zapisz PDF
        </button>
      </div>
      <p className="mb-8 text-sm text-zinc-500">Codzienna praca w systemie: zadania, rozdzielnie, szafy rack, etykiety.</p>

      <Section n={1} title="Logowanie">
        <p className="text-sm text-zinc-300">Wejdź na stronę aplikacji i zaloguj się swoim loginem i hasłem, które dostałeś od administratora lub brygadzisty.</p>
        <Tip><strong className="text-orange-400">Zapomniałeś hasła?</strong> Skorzystaj z opcji resetu na ekranie logowania albo poproś administratora o nowe hasło.</Tip>
      </Section>

      <Section n={2} title="Harmonogram i zadania">
        <p className="text-sm text-zinc-300">Twoje zadania na dziś i najbliższe dni znajdziesz w zakładce <strong>Zadania</strong> — pokazane jako karty, które możesz otworzyć, żeby zobaczyć szczegóły i zmienić status.</p>
        <h3 className="mb-1.5 mt-4 text-sm font-semibold text-orange-400">Ścieżka statusów zadania</h3>
        <div className="mb-3 rounded-lg border border-zinc-800 bg-zinc-900 px-4 py-2.5 text-sm text-zinc-200">
          <strong>Nowe</strong> → <strong>W trakcie</strong> → (<strong>Oczekujące</strong> / <strong>Wstrzymane</strong>) → <strong>W trakcie</strong> → <strong>Zakończone</strong>
        </div>
        <StepList items={[
          'Otwórz zadanie i kliknij <strong>Rozpocznij</strong> — status zmienia się na "W trakcie", a system automatycznie zaczyna liczyć Twój czas pracy nad tym zadaniem.',
          'Jeśli musisz przerwać, bo czekasz na coś (np. na materiał, decyzję inwestora) — użyj <strong>Oczekujące</strong> i krótko opisz powód.',
          'Jeśli przerywasz z innego powodu (np. koniec dnia, inne pilne zadanie) — użyj <strong>Wstrzymane</strong>, też z powodem.',
          'Z obu tych stanów możesz wrócić do <strong>W trakcie</strong>, żeby kontynuować.',
          'Na koniec kliknij <strong>Zakończone</strong> — musisz wpisać krótkie podsumowanie wykonanej pracy (to pole jest wymagane), opcjonalnie dodatkowy komentarz.',
        ]} />
        <Tip><strong className="text-orange-400">Uwaga:</strong> po oznaczeniu zadania jako zakończone nie da się go samemu cofnąć do "W trakcie" — jeśli to pomyłka, zgłoś to administratorowi.</Tip>
      </Section>

      <Section n={3} title="Czas pracy">
        <p className="text-sm text-zinc-300">Nie musisz nic osobno włączać — czas pracy nad zadaniem liczy się <strong>automatycznie</strong>, gdy zadanie ma status "W trakcie", i zatrzymuje się, gdy je wstrzymasz, oznaczysz jako oczekujące albo zakończysz.</p>
        <p className="mt-2 text-sm text-zinc-300">Podsumowanie swojego czasu pracy (dzień po dniu, planowany kontra rzeczywisty) znajdziesz w widoku szczegółów zadania oraz w zakładce <strong>Czas pracy</strong>.</p>
      </Section>

      <Section n={4} title="Dokumentacja rozdzielni elektrycznej">
        <p className="text-sm text-zinc-300">Wejdź na stronę budowy → zakładka <strong>Rozdzielnie</strong>. Tu dokumentujesz rozdzielnice, ich zawartość, szafy rack i sprzęt PPOŻ.</p>
        <h3 className="mb-1.5 mt-4 text-sm font-semibold text-orange-400">Nowa rozdzielnia</h3>
        <StepList items={[
          'Kliknij <strong>Nowa rozdzielnia</strong>.',
          'Podaj nazwę (np. "Rozdzielnia Główna"), liczbę modułów DIN, opcjonalnie producenta i opis/lokalizację.',
        ]} />
        <h3 className="mb-1.5 mt-4 text-sm font-semibold text-orange-400">Dodawanie aparatów (bezpieczniki, różnicówki)</h3>
        <p className="text-sm text-zinc-300">Po rozwinięciu rozdzielni zobaczysz siatkę modułów — <strong>puste miejsce</strong> (przerywana ramka z "+") kliknij, żeby dodać aparat na tej konkretnej pozycji. Zajęte miejsca to kolorowe bloki — kliknięcie otwiera edycję.</p>
        <div className="mt-2">
          <StepList items={[
            'Wybierz rodzaj: bezpiecznik (MCB), różnicówka (RCD) albo inny.',
            'Podaj charakterystykę/typ, prąd znamionowy, liczbę biegunów.',
            '<strong>Najważniejsze pole — Przeznaczenie</strong>: opisz krótko, co ten obwód zasila, np. "oświetlenie łazienki" albo "gniazda pokój dzienny". To pole jest używane też przy drukowaniu etykiet.',
            'Jeśli to bezpiecznik chroniony przez wyłącznik różnicowy — wybierz go z listy <strong>"Chroniony przez RCD"</strong>. Dzięki temu etykiety mogą pokazać, które obwody są pod którym RCD.',
          ]} />
        </div>
        <Tip><strong className="text-orange-400">Wskazówka:</strong> im dokładniejszy opis przeznaczenia, tym czytelniejsza będzie potem wydrukowana etykieta — warto pisać krótko i konkretnie (np. "Zmywarka" zamiast "Gniazdo w kuchni do zmywarki").</Tip>
      </Section>

      <Section n={5} title="Szafy rack / LAN">
        <p className="text-sm text-zinc-300">W tej samej zakładce <strong>Rozdzielnie</strong>, w sekcji szaf rack, kliknij <strong>Nową szafę</strong> — podaj nazwę, wysokość w U (np. 42U) i lokalizację.</p>
        <h3 className="mb-1.5 mt-4 text-sm font-semibold text-orange-400">Urządzenia w szafie</h3>
        <p className="text-sm text-zinc-300">Kliknij nazwę szafy, żeby wejść w jej widok — zobaczysz pionową siatkę pozycji U (jak w prawdziwej szafie). Puste miejsce kliknij, żeby dodać urządzenie (switch, patch panel, router, UPS, itd.) z automatycznie ustawionym numerem pozycji.</p>
        <p className="mt-2 text-sm text-zinc-300">Dla switchy i patch paneli podaj liczbę portów — system utworzy je automatycznie.</p>
        <h3 className="mb-1.5 mt-4 text-sm font-semibold text-orange-400">Opisywanie portów</h3>
        <p className="text-sm text-zinc-300">Kliknij urządzenie, żeby zobaczyć siatkę jego portów. Kliknij port, żeby zapisać co jest do niego podłączone (typ, np. gniazdko LAN/kamera/access point, nazwę i lokalizację, np. "Pokój 101").</p>
      </Section>

      <Section n={6} title="Drukowanie etykiet">
        <p className="text-sm text-zinc-300">Przy rozdzielni, aparacie, szafie, urządzeniu i porcie znajdziesz ikonę drukarki — kliknięcie otwiera okno <strong>Drukuj etykietę</strong>.</p>
        <div className="mt-2">
          <StepList items={[
            'Wybierz szablon etykiety z listy.',
            'Jeśli akurat na tę jedną etykietę chcesz pokazać inne pola niż zwykle — rozwiń <strong>"Dostosuj pola tylko na ten wydruk"</strong>. To nie zmienia szablonu na stałe, tylko ten jeden wydruk.',
            'Kliknij <strong>Generuj etykietę</strong> — zobaczysz podgląd.',
            'Wydrukuj przez przeglądarkę (<strong>Otwórz PDF</strong>) albo, jeśli na Twoim komputerze działa lokalny Print Agent podłączony do drukarki etykiet, wybierz ją z listy i kliknij <strong>Wyślij do drukarki</strong>.',
          ]} />
        </div>
        <Tip><strong className="text-orange-400">Wydruk masowy:</strong> przy liście aparatów/urządzeń jest przycisk "Drukuj etykiety wszystkich..." — jednym kliknięciem wydrukujesz etykiety dla całej rozdzielni czy szafy naraz.</Tip>
      </Section>

      <Section n={7} title="Gdy coś nie działa">
        <ul className="list-disc space-y-1.5 pl-5 text-sm text-zinc-300">
          <li>Jeśli aplikacja pokazuje błąd albo coś wygląda nie tak — zrób zrzut ekranu i zgłoś administratorowi/brygadziście.</li>
          <li>Nie da się cofnąć zakończonego zadania ani usunąć rekordów (to uprawnienie ma tylko admin/brygadzista) — jeśli coś trzeba poprawić, poproś ich o pomoc.</li>
          <li>Twoje dane logowania są prywatne — nie udostępniaj hasła współpracownikom.</li>
        </ul>
      </Section>

      <footer className="border-t border-zinc-800 pt-4 text-center text-xs text-zinc-600">P-Troy ERP — instrukcja dla instalatora</footer>
    </div>
  );
}
