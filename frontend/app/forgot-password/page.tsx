'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { Mail, ArrowLeft, Loader2, CheckCircle2 } from 'lucide-react';
import Link from 'next/link';
import { apiClient } from '@/lib/api-client';

/**
 * Formularz odzyskiwania hasła. Zawsze pokazuje ten sam komunikat
 * sukcesu niezależnie od tego, czy podany e-mail istnieje w systemie —
 * to celowa ochrona przed enumeracją kont (patrz AuthService.requestPasswordReset).
 */
export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await apiClient('/api/auth/password-reset/request', { method: 'POST', body: { email }, skipAuthRetry: true });
    } catch {
      // Celowo ignorujemy błąd — nie ujawniamy czy e-mail istnieje w systemie
    } finally {
      setSubmitting(false);
      setSent(true);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-graphite-950 px-4">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-sm rounded-2xl border border-zinc-800 bg-zinc-900/80 p-8 shadow-2xl"
      >
        <Link href="/login" className="mb-6 flex items-center gap-1.5 text-xs text-zinc-500 hover:text-orange-500">
          <ArrowLeft className="h-3.5 w-3.5" /> Wróć do logowania
        </Link>

        {sent ? (
          <div className="flex flex-col items-center gap-3 py-4 text-center">
            <CheckCircle2 className="h-10 w-10 text-emerald-500" />
            <p className="text-sm text-zinc-300">
              Jeśli podany adres e-mail istnieje w systemie, wysłaliśmy na niego
              link do zresetowania hasła. Sprawdź swoją skrzynkę odbiorczą.
            </p>
          </div>
        ) : (
          <>
            <h1 className="mb-1 text-lg font-semibold text-white">Odzyskiwanie hasła</h1>
            <p className="mb-6 text-xs text-zinc-500">Podaj adres e-mail powiązany z Twoim kontem.</p>
            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              <div className="relative">
                <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="adres@firma.pl"
                  required
                  className="w-full rounded-lg border border-zinc-700 bg-zinc-950 py-2.5 pl-10 pr-3 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-orange-500 focus:outline-none"
                />
              </div>
              <button
                type="submit"
                disabled={submitting}
                className="flex items-center justify-center gap-2 rounded-lg bg-orange-600 py-2.5 text-sm font-medium text-white hover:bg-orange-500 disabled:opacity-60"
              >
                {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
                Wyślij link resetujący
              </button>
            </form>
          </>
        )}
      </motion.div>
    </div>
  );
}
