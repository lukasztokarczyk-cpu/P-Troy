'use client';

import { ReactNode, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  maxWidth?: string;
}

/**
 * Wspólny modal formularza — zastępuje serie window.prompt() jednym
 * ekranem, na którym widać wszystkie pola naraz. Zamyka się przez
 * kliknięcie tła, przycisk X, lub klawisz Escape.
 */
export function Modal({ open, onClose, title, description, children, maxWidth = 'max-w-md' }: ModalProps) {
  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4"
          onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 8 }}
            transition={{ duration: 0.15 }}
            className={`w-full ${maxWidth} rounded-2xl border border-zinc-800 bg-zinc-900 p-5 shadow-2xl`}
          >
            <div className="mb-4 flex items-start justify-between">
              <div>
                <h3 className="text-base font-semibold text-white">{title}</h3>
                {description && <p className="mt-0.5 text-xs text-zinc-500">{description}</p>}
              </div>
              <button onClick={onClose} className="rounded-lg p-1 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200">
                <X className="h-4 w-4" />
              </button>
            </div>
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/**
 * Wspólne stylowanie pól formularza — inputy, select, textarea.
 * Używane wewnątrz <Modal> na wszystkich stronach z formularzami.
 */
export const fieldClass =
  'w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-orange-500 focus:outline-none';
export const labelClass = 'mb-1.5 mt-3 block text-xs text-zinc-500 first:mt-0';
