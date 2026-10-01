import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { REQUIRES_MODULE_KEY } from '../decorators/requires-module.decorator';
import { AdminTilesService } from '../../modules/admin-tiles/admin-tiles.service';

/**
 * Egzekwuje dostęp do modułu na backendzie (nie tylko ukrywanie kafelka w UI).
 * Używać PO JwtAuthGuard: @UseGuards(JwtAuthGuard, ModuleAccessGuard).
 */
@Injectable()
export class ModuleAccessGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly tiles: AdminTilesService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const moduleKey = this.reflector.getAllAndOverride<string | undefined>(REQUIRES_MODULE_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!moduleKey) return true;

    const { user } = context.switchToHttp().getRequest();
    if (!user) throw new ForbiddenException('Brak dostępu do tego modułu');

    const allowed = await this.tiles.hasModuleAccess(user.id, user.role, user.customRoleId, moduleKey);
    if (!allowed) throw new ForbiddenException('Brak dostępu do tego modułu');
    return true;
  }
}
