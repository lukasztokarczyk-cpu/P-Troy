'use client';

import { useCallback, useEffect, useState } from 'react';
import { Loader2, Plus } from 'lucide-react';
import { apiClient } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { type ProtocolListItem, errorMessage } from '@/lib/protocols';
import { ProtocolList } from './ProtocolList';
import { NewProtocolWizard } from './NewProtocolWizard';

/** Zakładka „Protokoły” na stronie budowy: protokoły tej budowy + szybkie utworzenie nowego. */
export function SiteProtocols({ siteId }: { siteId: string }) {
  const [items, setItems] = useState<ProtocolListItem[] | null>(null);
  const [error, setError] = useState('');
  const [wizard, setWizard] = useState(false);

  const load = useCallback(() => {
    apiClient<ProtocolListItem[]>(`/api/protocols/site/${siteId}`).then(setItems).catch((e) => { setItems([]); setError(errorMessage(e)); });
  }, [siteId]);
  useEffect(() => { load(); }, [load]);

  return (
    <div data-testid="site-protocols">
      <div className="mb-3 flex justify-end">
        <Button onClick={() => setWizard(true)}><Plus className="mr-2 h-4 w-4" />Nowy protokół</Button>
      </div>
      {error && <p className="mb-3 rounded-lg bg-red-950/50 p-2 text-xs text-red-300">{error}</p>}
      {items === null ? <div className="flex justify-center p-8"><Loader2 className="h-5 w-5 animate-spin text-zinc-500" /></div> : <ProtocolList items={items} showSite={false} />}
      <NewProtocolWizard open={wizard} onClose={() => setWizard(false)} presetSiteId={siteId} />
    </div>
  );
}
