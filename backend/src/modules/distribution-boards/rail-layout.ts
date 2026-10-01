import { BadRequestException, ConflictException } from '@nestjs/common';

/**
 * Czysta logika układu szyn DIN w rozdzielni (bez dostępu do bazy — dzięki temu
 * da się ją testować samodzielnie). Szyny mają numery 1..N i własną liczbę
 * modułów; aparat stoi na konkretnej szynie w konkretnym miejscu (railSlot),
 * a globalny `position` (używany przez etykiety) = suma modułów poprzednich
 * szyn + railSlot.
 */

export interface RailLite { id: string; number: number; moduleCount: number }
export interface DeviceLite {
  id: string;
  position: number | null;
  railId: string | null;
  railSlot: number | null;
  poles: string | null;
}
export interface RailInput { id?: string; moduleCount: number }
export interface RailAssignment { deviceId: string; railIndex: number; railSlot: number; position: number }

// Szerokość aparatu w modułach — taka sama zasada jak w BoardVisualization (frontend)
export function polesWidth(poles?: string | null): number {
  switch (poles) {
    case '1P+N': return 2;
    case '2P': return 2;
    case '3P': return 3;
    case '3P+N': return 4;
    default: return 1;
  }
}

function offsetsOf(caps: number[]): number[] {
  const offsets: number[] = [];
  let acc = 0;
  for (const c of caps) { offsets.push(acc); acc += c; }
  return offsets;
}

/** Tłumaczy globalne miejsce (1..suma) na indeks szyny i miejsce na niej. */
function locate(caps: number[], position: number): { railIndex: number; railSlot: number } | null {
  const offsets = offsetsOf(caps);
  for (let i = 0; i < caps.length; i++) {
    if (position > offsets[i] && position <= offsets[i] + caps[i]) {
      return { railIndex: i, railSlot: position - offsets[i] };
    }
  }
  return null;
}

/**
 * Ustala szynę i miejsce dla nowego/edytowanego aparatu na podstawie globalnego
 * miejsca. Rzuca 400 (poza rozdzielnią / nie mieści się na szynie) albo 409
 * (miejsce zajęte).
 */
export function findPlacement(
  rails: RailLite[],
  devices: DeviceLite[],
  position: number,
  poles: string | null | undefined,
  excludeDeviceId?: string,
): { railId: string; railSlot: number } {
  const sorted = [...rails].sort((a, b) => a.number - b.number);
  const caps = sorted.map((r) => r.moduleCount);
  const total = caps.reduce((a, b) => a + b, 0);

  const loc = locate(caps, position);
  if (!loc) {
    throw new BadRequestException(`Miejsce ${position} jest poza rozdzielnią (łącznie ${total} modułów na ${sorted.length} szynach)`);
  }
  const rail = sorted[loc.railIndex];
  const width = polesWidth(poles);
  if (loc.railSlot + width - 1 > rail.moduleCount) {
    throw new BadRequestException(
      `Aparat zajmuje ${width} mod., a od miejsca ${loc.railSlot} na szynie ${rail.number} zostało ${rail.moduleCount - loc.railSlot + 1}`,
    );
  }
  for (const other of devices) {
    if (other.id === excludeDeviceId || other.railId !== rail.id || other.railSlot == null) continue;
    const oStart = other.railSlot;
    const oEnd = oStart + polesWidth(other.poles) - 1;
    if (loc.railSlot <= oEnd && loc.railSlot + width - 1 >= oStart) {
      throw new ConflictException(`Miejsce zajęte — na szynie ${rail.number} aparat już stoi na miejscach ${oStart}–${oEnd}`);
    }
  }
  return { railId: rail.id, railSlot: loc.railSlot };
}

/**
 * Planuje nową konfigurację szyn: sprawdza, że żaden aparat nie zostanie
 * "ucięty" ani osierocony, i zwraca nowe położenie wszystkich aparatów,
 * które stoją na jakimś miejscu. Rzuca 409 z listą problemów.
 * Pierwsza konfiguracja szyn dla rozdzielni bez szyn: aparaty z `position`
 * są rozmieszczane według globalnego miejsca.
 */
export function planRails(existing: RailLite[], devices: DeviceLite[], input: RailInput[]): RailAssignment[] {
  const existingById = new Map(existing.map((r) => [r.id, r]));
  for (const r of input) {
    if (r.id && !existingById.has(r.id)) throw new BadRequestException('Nieznana szyna w konfiguracji');
  }
  const ids = input.filter((r) => r.id).map((r) => r.id!);
  if (new Set(ids).size !== ids.length) throw new BadRequestException('Ta sama szyna występuje w konfiguracji dwa razy');

  const caps = input.map((r) => r.moduleCount);
  const offsets = offsetsOf(caps);
  const total = caps.reduce((a, b) => a + b, 0);
  const problems: string[] = [];
  const removedWithDevices = new Map<number, number>();
  const assignments: RailAssignment[] = [];

  for (const d of devices) {
    let railIndex = -1;
    let railSlot = 0;

    if (d.railId) {
      railIndex = input.findIndex((r) => r.id === d.railId);
      if (railIndex === -1) {
        const old = existingById.get(d.railId);
        const n = old ? old.number : 0;
        removedWithDevices.set(n, (removedWithDevices.get(n) ?? 0) + 1);
        continue;
      }
      railSlot = d.railSlot ?? 0;
      if (railSlot < 1) continue; // brak miejsca — aparat nieustawiony
    } else if (d.position != null) {
      const loc = locate(caps, d.position);
      if (!loc) {
        problems.push(`aparat na miejscu ${d.position} wypada poza nową konfigurację (łącznie ${total} modułów)`);
        continue;
      }
      railIndex = loc.railIndex;
      railSlot = loc.railSlot;
    } else {
      continue; // aparat bez przypisanego miejsca
    }

    const width = polesWidth(d.poles);
    if (railSlot + width - 1 > caps[railIndex]) {
      problems.push(`szyna ${railIndex + 1}: aparat na miejscach ${railSlot}–${railSlot + width - 1} nie mieści się (szyna ma ${caps[railIndex]} mod.)`);
      continue;
    }
    assignments.push({ deviceId: d.id, railIndex, railSlot, position: offsets[railIndex] + railSlot });
  }

  for (const [n, count] of removedWithDevices) {
    problems.push(`szyna ${n} zawiera aparaty (${count}) — przenieś je lub usuń przed usunięciem szyny`);
  }

  // nakładanie się aparatów (np. w starej rozdzielni bez szyn, gdzie nic tego nie pilnowało)
  const widthById = new Map(devices.map((d) => [d.id, polesWidth(d.poles)]));
  const byRail = new Map<number, RailAssignment[]>();
  for (const a of assignments) byRail.set(a.railIndex, [...(byRail.get(a.railIndex) ?? []), a]);
  for (const [idx, list] of byRail) {
    list.sort((a, b) => a.railSlot - b.railSlot);
    for (let i = 1; i < list.length; i++) {
      const prev = list[i - 1];
      const prevEnd = prev.railSlot + widthById.get(prev.deviceId)! - 1;
      if (list[i].railSlot <= prevEnd) {
        problems.push(`szyna ${idx + 1}: aparaty nakładają się na miejscach ${list[i].railSlot}–${prevEnd}`);
      }
    }
  }

  if (problems.length > 0) {
    throw new ConflictException(`Nie można zmienić szyn: ${problems.slice(0, 6).join('; ')}${problems.length > 6 ? ' …' : ''}`);
  }
  return assignments;
}
