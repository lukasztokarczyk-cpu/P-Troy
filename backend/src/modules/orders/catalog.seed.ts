/**
 * Domyślny katalog materiałów. Trafia do bazy raz (gdy tabela kategorii jest pusta); dalej administrator
 * dodaje, edytuje i ukrywa pozycje w aplikacji — bez zmian w kodzie. Nie ma tu producentów ani modeli:
 * parametry (seria, typ, przekrój, charakterystyka) dopisuje się w polu „specyfikacja”.
 */
export interface SeedItem { name: string; unit?: string; hint?: string }
export interface SeedCategory { name: string; items: SeedItem[] }

const m = (name: string, hint?: string): SeedItem => ({ name, unit: 'm', hint });
const s = (name: string, hint?: string): SeedItem => ({ name, hint });
const op = (name: string, hint?: string): SeedItem => ({ name, unit: 'op.', hint });

export const DEFAULT_CATALOG: SeedCategory[] = [
  {
    name: 'Osprzęt elektryczny',
    items: [
      s('Gniazdo pojedyncze', 'seria, kolor'),
      s('Gniazdo podwójne', 'seria, kolor'),
      s('Gniazdo hermetyczne', 'IP, seria'),
      s('Łącznik pojedynczy', 'seria, kolor'),
      s('Łącznik świecznikowy', 'seria, kolor'),
      s('Łącznik schodowy', 'seria, kolor'),
      s('Łącznik krzyżowy', 'seria, kolor'),
      s('Puszka podtynkowa', 'średnica, głębokość'),
      s('Puszka natynkowa', 'wymiar, IP'),
      s('Puszka rozgałęźna', 'wymiar, IP'),
      s('Ramki do osprzętu', 'seria, kolor, krotność'),
    ],
  },
  {
    name: 'Kable i przewody',
    items: [
      m('YDYp 3×1,5 mm²'),
      m('YDYp 3×2,5 mm²'),
      m('YDY 5×2,5 mm²'),
      m('YDY 5×4 mm²'),
      m('YDY 5×6 mm²'),
      m('Przewód ochronny PE', 'przekrój'),
      m('Przewód linkowy', 'przekrój, kolor'),
      m('Kabel ziemny YKY', 'liczba żył i przekrój'),
      m('Przewód UTP kat. 6', 'wewnętrzny / zewnętrzny'),
      m('Przewód koncentryczny', 'typ'),
      m('Inny kabel lub przewód', 'typ i przekrój'),
    ],
  },
  {
    name: 'Rozdzielnice i zabezpieczenia',
    items: [
      s('Rozdzielnica podtynkowa', 'liczba modułów, liczba rzędów'),
      s('Rozdzielnica natynkowa', 'liczba modułów, IP'),
      s('Wyłącznik nadprądowy B10', 'liczba biegunów'),
      s('Wyłącznik nadprądowy B16', 'liczba biegunów'),
      s('Wyłącznik nadprądowy B20', 'liczba biegunów'),
      s('Wyłącznik różnicowoprądowy', 'In, IΔn, typ (A/AC), bieguny'),
      s('Wyłącznik różnicowoprądowy z członem nadprądowym RCBO', 'In, charakterystyka, IΔn, typ'),
      s('Ogranicznik przepięć', 'typ (T1/T2), bieguny'),
      s('Rozłącznik izolacyjny', 'In, bieguny'),
      s('Szyna grzebieniowa', 'liczba modułów, bieguny'),
      s('Blok rozdzielczy', 'In, liczba zacisków'),
      s('Złączki i listwy zaciskowe', 'przekrój, liczba torów'),
      s('Obudowa i akcesoria do rozdzielnicy'),
    ],
  },
  {
    name: 'Oświetlenie',
    items: [
      s('Oprawa LED', 'moc, barwa, wymiar'),
      s('Oprawa hermetyczna', 'moc, długość, IP'),
      s('Naświetlacz LED', 'moc, barwa, IP'),
      s('Panel LED', 'moc, wymiar, barwa'),
      s('Czujnik ruchu', 'typ, zasięg'),
      s('Zasilacz LED', 'moc, napięcie'),
      m('Taśma LED', 'moc/m, barwa, IP'),
      s('Inne materiały oświetleniowe'),
    ],
  },
  {
    name: 'Trasy kablowe i montaż',
    items: [
      m('Peszel', 'średnica'),
      m('Rura instalacyjna', 'średnica, typ'),
      m('Korytko kablowe', 'wymiar'),
      m('Kanał instalacyjny', 'wymiar'),
      op('Uchwyt do przewodów', 'rozmiar'),
      op('Kołki i wkręty', 'rozmiar'),
      op('Opaski kablowe', 'długość, szerokość'),
      op('Uchwyty montażowe', 'rozmiar'),
      s('Wsporniki', 'typ, długość'),
      s('Inne akcesoria montażowe'),
    ],
  },
  {
    name: 'Aparatura, złączki i drobnica',
    items: [
      op('Złączki instalacyjne', 'typ, liczba wejść'),
      op('Złączki WAGO — różne rodzaje', 'seria, liczba wejść'),
      op('Złączki szynowe', 'przekrój'),
      op('Tulejki kablowe', 'przekrój'),
      op('Końcówki kablowe', 'typ, przekrój'),
      s('Dławnice', 'rozmiar (PG/M), IP'),
      s('Taśma izolacyjna', 'kolor'),
      op('Oznaczniki przewodów', 'zakres opisów'),
      m('Peszle i osłony', 'średnica'),
      s('Inne akcesoria'),
    ],
  },
  {
    name: 'Teletechnika i zabezpieczenia',
    items: [
      s('Kamera IP', 'rozdzielczość, typ'),
      s('Rejestrator', 'liczba kanałów'),
      s('Switch PoE', 'liczba portów'),
      s('Punkt dostępowy Wi-Fi'),
      s('Patch panel', 'liczba portów, kat.'),
      s('Gniazdo komputerowe RJ45', 'kat., ekranowane'),
      s('Moduł RJ45', 'kat., ekranowany'),
      s('Szafa RACK', 'wysokość (U), głębokość'),
      s('Czujka alarmowa', 'typ'),
      s('Inne materiały teletechniczne'),
    ],
  },
];
