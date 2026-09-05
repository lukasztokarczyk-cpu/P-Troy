import { LabelTargetType } from '@prisma/client';

export interface LabelFieldDef {
  key: string;
  label: string;
}

export interface LabelResolvedRecord {
  displayName: string; // np. "QF-01" — do historii wydruków (recordLabel)
  fields: Record<string, string>; // wartości pól dostępnych w fieldsLayout szablonu
  targetPath: string; // ścieżka względna w aplikacji, np. "/sites/x/racks/y" — do QR
}

/**
 * Wspólny interfejs źródła danych etykiety. Każdy moduł (Rack, Rozdzielnie,
 * w przyszłości Sprzęt/Magazyn/Projekty...) dostarcza własną implementację
 * i rejestruje ją w LabelProviderRegistryService — centralny generator
 * etykiet (LabelsService + LabelPrinterService) nie zna szczegółów
 * poszczególnych modułów, tylko woła resolve()/getAvailableFields().
 */
export interface LabelDataProvider {
  readonly targetType: LabelTargetType;
  getAvailableFields(): LabelFieldDef[];
  resolve(recordId: string): Promise<LabelResolvedRecord | null>;
}
