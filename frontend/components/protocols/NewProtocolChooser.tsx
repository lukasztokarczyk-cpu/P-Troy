'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { FileText, ClipboardList } from 'lucide-react';
import { Modal } from '@/components/ui/modal';
import { NewProtocolWizard } from './NewProtocolWizard';

/**
 * Wybór rodzaju nowego protokołu. „Profesjonalny” uruchamia dotychczasowy kreator BEZ ZMIAN,
 * „prosty” otwiera osobny formularz.
 */
export function NewProtocolChooser({ open, onClose, presetSiteId }: { open: boolean; onClose: () => void; presetSiteId?: string }) {
  const router = useRouter();
  const [professional, setProfessional] = useState(false);

  useEffect(() => { if (!open) setProfessional(false); }, [open]);

  const goSimple = () => {
    onClose();
    router.push(presetSiteId ? `/protocols/simple/new?siteId=${encodeURIComponent(presetSiteId)}` : '/protocols/simple/new');
  };

  return (
    <>
      <Modal open={open && !professional} onClose={onClose} title="Nowy protokół" description="Wybierz rodzaj protokołu" closeOnOverlayClick={false}>
        <div className="space-y-3">
          <button type="button" data-testid="choose-professional" onClick={() => setProfessional(true)} className="flex w-full items-start gap-3 rounded-xl border border-zinc-700 p-4 text-left hover:border-orange-600 hover:bg-zinc-900">
            <FileText className="mt-0.5 h-6 w-6 shrink-0 text-orange-500" />
            <span>
              <span className="block text-sm font-semibold text-white">Protokół profesjonalny</span>
              <span className="block text-xs text-zinc-400">Pomiary i badania instalacji — pełny kreator z wynikami, wnioskami i dokumentem PDF.</span>
            </span>
          </button>
          <button type="button" data-testid="choose-simple" onClick={goSimple} className="flex w-full items-start gap-3 rounded-xl border border-zinc-700 p-4 text-left hover:border-orange-600 hover:bg-zinc-900">
            <ClipboardList className="mt-0.5 h-6 w-6 shrink-0 text-orange-500" />
            <span>
              <span className="block text-sm font-semibold text-white">Protokół prosty</span>
              <span className="block text-xs text-zinc-400">Opis wykonanych prac, liczba zamontowanych elementów i zdjęcia — szybki dokument do wydruku.</span>
            </span>
          </button>
        </div>
      </Modal>
      <NewProtocolWizard open={open && professional} onClose={onClose} presetSiteId={presetSiteId} />
    </>
  );
}
