'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { FileCheck, Loader2 } from 'lucide-react';
import { apiClient } from '@/lib/api-client';
import { useAuth } from '@/lib/auth-context';
import { Button } from '@/components/ui/button';

/**
 * "Przy pierwszym logowaniu instalator musi zaakceptować regulamin."
 * Pełnoekranowa blokada — dopóki termsAcceptedAt jest puste, instalator
 * nie widzi żadnej innej treści panelu. Po akceptacji odświeżamy profil
 * (refreshUser), więc blokada znika bez przeładowania strony.
 */
export function TermsGate({ children }: { children: React.ReactNode }) {
  const { user, refreshUser } = useAuth();
  const [accepting, setAccepting] = useState(false);
  const [checked, setChecked] = useState(false);

  const mustAcceptTerms = user?.role === 'INSTALATOR' && !user.termsAcceptedAt;

  if (!mustAcceptTerms) return <>{children}</>;

  const handleAccept = async () => {
    setAccepting(true);
    try {
      await apiClient('/api/auth/accept-terms', { method: 'POST' });
      await refreshUser();
    } finally {
      setAccepting(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-graphite-950 px-4">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-lg rounded-2xl border border-zinc-800 bg-zinc-900 p-6 shadow-2xl"
      >
        <div className="mb-4 flex items-center gap-2">
          <FileCheck className="h-5 w-5 text-orange-500" />
          <h1 className="text-lg font-semibold text-white">Regulamin systemu</h1>
        </div>

        <div className="mb-4 max-h-64 overflow-y-auto rounded-lg border border-zinc-800 bg-zinc-950 p-4 text-sm leading-relaxed text-zinc-400">
          <p className="mb-2">
            Korzystając z systemu ERP Elektryk, użytkownik zobowiązuje się do:
          </p>
          <ul className="list-disc space-y-1 pl-5">
            <li>rzetelnego rejestrowania czasu pracy i wykonywanych czynności,</li>
            <li>prawdziwego raportowania zużytych materiałów oraz wydatków,</li>
            <li>obowiązkowego dołączania dowodu zakupu (paragon/faktura) do każdej zgłoszonej notatki wydatkowej,</li>
            <li>niezwłocznego zgłaszania awarii sprzętu i pojazdów firmowych,</li>
            <li>ochrony danych dostępowych do konta i niezawierania ich osobom trzecim,</li>
            <li>przestrzegania zasad BHP podczas realizacji zleceń.</li>
          </ul>
          <p className="mt-2">
            Administrator zastrzega sobie prawo do wglądu w dane rejestrowane w systemie
            w celach rozliczeniowych i nadzoru nad realizacją prac.
          </p>
        </div>

        <label className="mb-4 flex items-start gap-2 text-sm text-zinc-300">
          <input
            type="checkbox"
            checked={checked}
            onChange={(e) => setChecked(e.target.checked)}
            className="mt-0.5 accent-orange-600"
          />
          Przeczytałem/-am i akceptuję regulamin systemu.
        </label>

        <Button
          onClick={handleAccept}
          disabled={!checked || accepting}
          className="w-full bg-orange-600 text-white hover:bg-orange-500"
        >
          {accepting ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : null}
          Akceptuję i przechodzę dalej
        </Button>
      </motion.div>
    </div>
  );
}
