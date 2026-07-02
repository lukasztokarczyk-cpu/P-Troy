# Nowe moduły ERP — Harmonogram, Zadania, Podpisy elektroniczne, Kody QR/kreskowe

## Co zawiera ten pakiet

```
prisma/schema-modules.prisma        — modele danych (do wklejenia do schema.prisma)
backend/src/modules/schedule/       — Harmonogram (NestJS)
backend/src/modules/tasks/          — Zadania (NestJS)
backend/src/modules/signatures/     — Podpisy elektroniczne (NestJS)
backend/src/modules/inventory-codes/— Kody QR/kreskowe (NestJS)
backend/src/common/gateways/        — wspólny RealtimeGateway (WebSocket)
frontend/components/schedule/       — kalendarz Dzień/Tydzień/Miesiąc/Rok + Drag&Drop
frontend/components/tasks/          — tablica Kanban zadań
frontend/components/signature/      — panel podpisu elektronicznego (mysz/dotyk/rysik)
frontend/components/scanner/        — skaner QR/kreskowy z kamery (ciągły odczyt)
```

## Jak wpiąć do istniejącego systemu (bez przebudowy)

1. **Baza danych**: wklej zawartość `schema-modules.prisma` do głównego `schema.prisma`,
   uzupełnij relacje zwrotne (`ScheduleEvent[]`, `Task[]` itd.) w istniejących modelach
   `User`, `Site`, `Vehicle`, `Product`, `Warehouse`. Uruchom `npx prisma migrate dev`.
2. **Backend**: zaimportuj `ScheduleModule`, `TasksModule`, `SignaturesModule`,
   `InventoryCodesModule` oraz `RealtimeModule` (globalny) w `AppModule`. Każdy moduł jest
   samodzielny — brak zależności cyklicznych poza jawnymi `exports` do integracji.
3. **Frontend**: każdy kafelek dashboardu podpina odpowiedni komponent (`ScheduleCalendar`,
   `TaskBoard`, `SignaturePad`, `BarcodeScanner`) i łączy go z API + WebSocket (`socket.io-client`,
   namespace `realtime`, `auth: { userId }`).
4. **Zależności do doinstalowania**:
   - backend: `@nestjs/schedule`, `socket.io`
   - frontend: `@zxing/library` (skaner), `framer-motion`, `lucide-react` (już w stacku bazowym)

## Punkty integracji zrealizowane w kodzie

| Wymaganie                                                   | Gdzie w kodzie |
|--------------------------------------------------------------|----------------|
| Zadanie przypisane do budowy                                 | `Task.siteId` |
| Harmonogram automatycznie tworzy zadania                     | `ScheduleService.create` (`dto.createLinkedTask`) |
| Pobranie materiałów aktualizuje stany magazynowe              | `InventoryCodesService.scan` → `applyStockMutation` (transakcja) |
| Pojazd przypisany do zadania/wydarzenia widoczny w harmonogramie | `ScheduleEvent.vehicleId` |
| Pomiary automatycznie przypisane do budowy                   | `SignableDocument.siteId` + `measurementId` |
| Podpisane protokoły archiwizowane w dokumentacji budowy       | `SignableDocument.pdfPath` (generowany po komplecie podpisów) |
| Wszystkie działania w dzienniku zdarzeń (Audit Log)           | `TaskHistory`, `CodeScanEvent`, `ScheduleComment` — każdy z `userId` + `createdAt`; zalecane spięcie z globalnym `AuditLogInterceptor` (istniejącym w rdzeniu systemu) |
| Pracownik widzi tylko przypisane wydarzenia/zadania           | `ScheduleService.assertVisible`, `TasksService.assertVisible` — egzekwowane w zapytaniu Prisma, nie tylko w UI |
| Powiadomienia in-app / Push / e-mail z przypomnieniami        | `ScheduleReminderProcessor` (cron co minutę, idempotentny) |

## Uwagi projektowe

- **Bezpieczeństwo widoczności** jest wymuszane na poziomie zapytań do bazy (`where: { assignees: { some: { userId } } }`),
  a nie tylko filtrowane w UI — pracownik fizycznie nie otrzyma z API danych, do których nie ma dostępu.
- **Blokada dokumentu po podpisach** (`SignableDocument.isLocked`) jest sprawdzana atomowo w transakcji,
  więc nie da się złożyć dwóch podpisów tej samej roli ani edytować dokumentu po komplecie podpisów.
- **Skaner kodów** rozróżnia operacje `LOOKUP` (sam podgląd) od operacji zmieniających stan magazynowy —
  te drugie zawsze przechodzą przez `applyStockMutation` w transakcji Prisma, więc log skanowania
  i stan magazynu nigdy się nie rozjadą.
