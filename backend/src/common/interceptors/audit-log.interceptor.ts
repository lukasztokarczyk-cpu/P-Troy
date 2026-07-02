import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Globalny interceptor rejestrowany w main.ts. Zapisuje wpis w AuditLog
 * dla każdego mutującego żądania (POST/PATCH/PUT/DELETE) zakończonego
 * sukcesem — kto, co, kiedy, z jakiego IP i urządzenia. Nie blokuje
 * odpowiedzi (zapis asynchroniczny w tle) i nigdy nie rzuca wyjątku
 * do klienta, jeśli sam zapis audytu się nie powiedzie.
 */
@Injectable()
export class AuditLogInterceptor implements NestInterceptor {
  constructor(private readonly prisma: PrismaService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest();
    const method = request.method;

    if (!['POST', 'PATCH', 'PUT', 'DELETE'].includes(method)) {
      return next.handle();
    }

    return next.handle().pipe(
      tap(() => {
        const { entityType, action } = this.deriveEntity(request);
        this.prisma.auditLog
          .create({
            data: {
              userId: request.user?.id,
              action: `${entityType}.${action}`,
              entityType,
              entityId: request.params?.id,
              ipAddress: request.headers['x-forwarded-for'] || request.socket?.remoteAddress,
              userAgent: request.headers['user-agent'],
              metadata: this.sanitizeBody(request.body),
            },
          })
          .catch(() => {
            // celowo wyciszone — audyt nie może wywrócić głównego żądania
          });
      }),
    );
  }

  private deriveEntity(request: any): { entityType: string; action: string } {
    // np. /api/tasks/:id/status -> entityType "tasks", action zależny od metody
    const segments = request.route?.path?.split('/').filter(Boolean) ?? [];
    const entityType = segments[1] || 'unknown';
    const actionMap: Record<string, string> = {
      POST: 'created',
      PATCH: 'updated',
      PUT: 'updated',
      DELETE: 'deleted',
    };
    return { entityType, action: actionMap[request.method] || 'action' };
  }

  private sanitizeBody(body: unknown) {
    if (!body || typeof body !== 'object') return undefined;
    const clone: Record<string, unknown> = { ...(body as Record<string, unknown>) };
    // Nigdy nie loguj wrażliwych danych (hasła, podpisy jako obraz) w audycie
    delete clone.password;
    delete clone.passwordHash;
    delete clone.signatureImageBase64;
    return clone;
  }
}
