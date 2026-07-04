'use client';

import { useEffect, useState, useCallback } from 'react';
import { Loader2, Plus, Hash, Calendar } from 'lucide-react';
import { apiClient } from '@/lib/api-client';
import { useAuth } from '@/lib/auth-context';
import { Button } from '@/components/ui/button';

interface Vehicle {
  id: string;
  make: string;
  model: string;
  registrationNumber: string;
  inspectionDueDate: string | null;
  assignments: { user: { firstName: string; lastName: string } }[];
}

export default function VehiclesPage() {
  const { isPrivileged } = useAuth();
  const [vehicles, setVehicles] = useState<Vehicle[] | null>(null);

  const loadVehicles = useCallback(() => {
    apiClient<Vehicle[]>('/api/vehicles').then(setVehicles).catch(() => setVehicles([]));
  }, []);

  useEffect(() => { loadVehicles(); }, [loadVehicles]);

  const handleCreate = async () => {
    const make = window.prompt('Marka:');
    if (!make) return;
    const model = window.prompt('Model:') || '';
    const registrationNumber = window.prompt('Nr rejestracyjny:') || '';
    await apiClient('/api/vehicles', {
      method: 'POST',
      body: { type: 'CAR', make, model, registrationNumber },
    }).catch((err) => alert(err.message));
    loadVehicles();
  };

  if (vehicles === null) {
    return <div className="flex h-64 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-orange-500" /></div>;
  }

  return (
    <div className="animate-fade-in">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-white">Pojazdy</h1>
          <p className="text-sm text-zinc-500">Flota firmowa.</p>
        </div>
        {isPrivileged && (
          <Button onClick={handleCreate} className="bg-orange-600 text-white hover:bg-orange-500">
            <Plus className="mr-1 h-4 w-4" /> Dodaj pojazd
          </Button>
        )}
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {vehicles.map((v) => (
          <div key={v.id} className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
            <h3 className="mb-2 text-sm font-semibold text-zinc-100">{v.make} {v.model}</h3>
            <div className="flex flex-col gap-1 text-xs text-zinc-500">
              <span className="flex items-center gap-1"><Hash className="h-3 w-3" /> {v.registrationNumber}</span>
              {v.inspectionDueDate && (
                <span className="flex items-center gap-1"><Calendar className="h-3 w-3" /> Przegląd: {new Date(v.inspectionDueDate).toLocaleDateString('pl-PL')}</span>
              )}
            </div>
          </div>
        ))}
        {vehicles.length === 0 && <p className="col-span-full py-12 text-center text-sm text-zinc-500">Brak pojazdów.</p>}
      </div>
    </div>
  );
}
