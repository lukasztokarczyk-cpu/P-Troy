import { SetMetadata } from '@nestjs/common';

export const REQUIRES_MODULE_KEY = 'requiresModule';

/**
 * Oznacza kontroler/endpoint jako należący do modułu (DashboardModule.key).
 * Egzekwowane przez ModuleAccessGuard — brak dostępu = 403.
 */
export const RequiresModule = (moduleKey: string) => SetMetadata(REQUIRES_MODULE_KEY, moduleKey);
