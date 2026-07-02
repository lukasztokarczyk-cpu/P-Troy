import { createParamDecorator, ExecutionContext } from '@nestjs/common';

// Wyciąga zalogowanego użytkownika ustawionego przez JwtAuthGuard/JwtStrategy
// (request.user) — używane we wszystkich kontrolerach zamiast ręcznego
// odczytu z req za każdym razem
export const CurrentUser = createParamDecorator((_: unknown, ctx: ExecutionContext) => {
  const request = ctx.switchToHttp().getRequest();
  return request.user;
});
