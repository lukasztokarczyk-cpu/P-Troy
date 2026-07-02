import { Role } from '@prisma/client';

export interface AuthenticatedUser {
  id: string;
  login: string;
  role: Role;
  customRoleId?: string | null;
}
