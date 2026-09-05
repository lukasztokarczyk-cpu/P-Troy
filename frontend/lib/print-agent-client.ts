'use client';

/**
 * P-Troy Print Agent to osobna, lekka usługa uruchamiana lokalnie na
 * komputerze użytkownika (patrz /print-agent w repozytorium), nasłuchująca
 * na 127.0.0.1:9123. Przeglądarka woła ją bezpośrednio (jak np. QZ Tray) —
 * backend P-Troy nigdy nie łączy się z drukarką sam, bo drukarki są
 * w sieci lokalnej użytkownika, a nie w internecie.
 */

const AGENT_URL = 'http://127.0.0.1:9123';

export interface PrintAgentPrinter {
  id: string;
  name: string;
  host: string;
  port: number;
}

export async function checkPrintAgent(): Promise<{ ok: boolean; version?: string }> {
  try {
    const res = await fetch(`${AGENT_URL}/health`, { signal: AbortSignal.timeout(1500) });
    if (!res.ok) return { ok: false };
    const data = await res.json();
    return { ok: true, version: data.version };
  } catch {
    return { ok: false };
  }
}

export async function listPrintAgentPrinters(): Promise<PrintAgentPrinter[]> {
  try {
    const res = await fetch(`${AGENT_URL}/printers`, { signal: AbortSignal.timeout(1500) });
    if (!res.ok) return [];
    return res.json();
  } catch {
    return [];
  }
}

export async function savePrintAgentPrinter(printer: Omit<PrintAgentPrinter, 'id'>): Promise<PrintAgentPrinter | null> {
  try {
    const res = await fetch(`${AGENT_URL}/printers`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(printer),
    });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

export async function sendZplToPrintAgent(printerId: string, zpl: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch(`${AGENT_URL}/print`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ printerId, zpl }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      return { ok: false, error: body.error || 'Print Agent zwrócił błąd' };
    }
    return { ok: true };
  } catch (err: any) {
    return { ok: false, error: 'Nie można połączyć się z P-Troy Print Agent na tym komputerze (127.0.0.1:9123)' };
  }
}
