'use client';

import { useCallback, useEffect, useState } from 'react';
import { Loader2, Plus } from 'lucide-react';
import { apiClient } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { type ProtocolListItem, errorMessage } from '@/lib/protocols';
import { ProtocolList } from './ProtocolList';
import { NewProtocolChooser } from './NewProtocolChooser';
import { SimpleProtocolList } from './SimpleProtocolList';
import type { SimpleProtocolListItem } from '@/lib/simple-protocols';

/** Zakładka „Protokoły” na stronie budowy: protokoły tej budowy + szybkie utworzenie nowego. */
export function SiteProtocols({ siteId }: { siteId: string }) {
  const [items, setItems] = useState<ProtocolListItem[] | null>(null);
  const [error, setError] = useState('');
  const [wizard, setWizard] = useState(false);
  const [simple, setSimple] = useState<SimpleProtocolListItem[]>([]);

  const load = useCallback(() => {
    apiClient<ProtocolListItem[]>(`/api/protocols/site/${siteId}`).then(setItems).catch((e) => { setItems([]); setError(errorMessage(e)); });
  }, [siteId]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    apiClient<SimpleProtocolListItem[]>(`/api/simple-protocols?siteId=${encodeURIComponent(siteId)}`).then(setSimple).catch(() => setSimple([]));
  }, [siteId]);

  return (
    <div data-testid="site-protocols">
      <div className="mb-3 flex justify-end">
        <Button onClick={() => setWizard(true)}><Plus className="mr-2 h-4 w-4" />Nowy protokół</Button>
      </div>
      {error && <p className="mb-3 rounded-lg bg-red-950/50 p-2 text-xs text-red-300">{error}</p>}
      {items === null ? <div className="flex justify-center p-8"><Loader2 className="h-5 w-5 animate-spin text-zinc-500" /></div> : <ProtocolList items={items} showSite={false} />}
      {simple.length > 0 && (
        <div className="mt-6">
          <h3 className="mb-2 text-sm font-semibold text-zinc-300">Protokoły proste</h3>
          <SimpleProtocolList items={simple} showSite={false} />
        </div>
      )}
      <NewProtocolChooser open={wizard} onClose={() => setWizard(false)} presetSiteId={siteId} />
    </div>
  );
}
