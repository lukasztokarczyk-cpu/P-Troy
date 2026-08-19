import { Injectable, Logger } from '@nestjs/common';

/**
 * Integracja z DirectAdmin API (CMD_API_POP) — automatyczne tworzenie
 * i aktualizacja skrzynek pocztowych dla instalatorów, tak aby login
 * do poczty (<login>@p-troy.pl) i hasło były zawsze zsynchronizowane
 * z kontem instalatora w aplikacji (jedno hasło do obu systemów).
 *
 * Autoryzacja: dedykowany "Klucz logowania" (Login Key) w DirectAdmin,
 * ograniczony wyłącznie do komendy CMD_API_POP i do adresu IP tego
 * serwera — NIE główne hasło do konta hostingowego.
 *
 * Zasada działania: każde wywołanie najpierw próbuje ZMODYFIKOWAĆ
 * istniejącą skrzynkę (action=modify); jeśli DirectAdmin odpowie, że
 * taka skrzynka nie istnieje, próbujemy ją UTWORZYĆ (action=create).
 * Dzięki temu ten sam kod obsługuje zarówno pierwsze założenie konta,
 * jak i każdą późniejszą zmianę/reset hasła — bez potrzeby wcześniej
 * sprawdzać, czy skrzynka już istnieje.
 *
 * Błędy komunikacji z DirectAdmin są tylko logowane i NIGDY nie
 * przerywają operacji w aplikacji (tworzenia/zmiany hasła użytkownika)
 * — konto w P-Troy ERP musi powstać niezależnie od tego, czy poczta
 * na hostingu jest akurat osiągalna.
 */
@Injectable()
export class DirectAdminService {
  private readonly logger = new Logger(DirectAdminService.name);

  private readonly baseUrl = process.env.DIRECTADMIN_URL;
  private readonly username = process.env.DIRECTADMIN_USERNAME;
  private readonly loginKey = process.env.DIRECTADMIN_LOGIN_KEY;
  private readonly domain = process.env.DIRECTADMIN_DOMAIN || 'p-troy.pl';
  private readonly quotaMb = process.env.DIRECTADMIN_MAILBOX_QUOTA_MB || '250';

  private get isConfigured(): boolean {
    return Boolean(this.baseUrl && this.username && this.loginKey);
  }

  private authHeader(): string {
    return 'Basic ' + Buffer.from(`${this.username}:${this.loginKey}`).toString('base64');
  }

  private async callApi(action: 'create' | 'modify', localPart: string, password: string): Promise<{ ok: boolean; raw: string }> {
    const params = new URLSearchParams({
      action,
      domain: this.domain,
      user: localPart,
      passwd: password,
      passwd2: password,
      quota: this.quotaMb,
    });
    const res = await fetch(`${this.baseUrl}/CMD_API_POP`, {
      method: 'POST',
      headers: {
        Authorization: this.authHeader(),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    });
    const raw = await res.text();
    // DirectAdmin API zwraca zwykle "error=0" (sukces) lub "error=1&text=..."
    // w treści odpowiedzi (nie w kodzie HTTP), stąd sprawdzamy zawartość.
    const ok = res.ok && !/error=1/i.test(raw);
    return { ok, raw };
  }

  /**
   * Zakłada skrzynkę pocztową <login>@<domena>, a jeśli już istnieje —
   * aktualizuje w niej hasło. Bezpieczne do wywołania wielokrotnie.
   */
  async syncMailbox(login: string, password: string): Promise<void> {
    if (!this.isConfigured) {
      this.logger.warn(
        'Integracja z DirectAdmin nie jest skonfigurowana (brak DIRECTADMIN_URL/USERNAME/LOGIN_KEY) — pomijam synchronizację skrzynki pocztowej.',
      );
      return;
    }
    const localPart = login.trim().toLowerCase();
    try {
      const modifyResult = await this.callApi('modify', localPart, password);
      if (modifyResult.ok) {
        this.logger.log(`Zsynchronizowano hasło skrzynki ${localPart}@${this.domain}`);
        return;
      }
      // Modyfikacja się nie powiodła (najpewniej skrzynka jeszcze nie
      // istnieje) — spróbuj utworzyć ją od nowa.
      const createResult = await this.callApi('create', localPart, password);
      if (createResult.ok) {
        this.logger.log(`Utworzono skrzynkę pocztową ${localPart}@${this.domain}`);
      } else {
        this.logger.error(
          `Nie udało się utworzyć ani zmodyfikować skrzynki ${localPart}@${this.domain}. ` +
          `Odpowiedź modify: ${modifyResult.raw} | Odpowiedź create: ${createResult.raw}`,
        );
      }
    } catch (err) {
      this.logger.error(`Błąd połączenia z DirectAdmin API przy synchronizacji skrzynki ${localPart}@${this.domain}: ${(err as Error).message}`);
    }
  }
}
