import { SetMetadata } from '@nestjs/common';

export const ROLES_KEY = 'roles';
// Przyjmuje role systemowe (Role) jako stringi — RolesGuard sprawdza je
// względem request.user.role
export const Roles = (...roles: string[]) => SetMetadata(ROLES_KEY, roles);
