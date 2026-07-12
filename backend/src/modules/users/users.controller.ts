import { Controller, Get, Post, Patch, Delete, Body, Param, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { UsersService } from './users.service';
import { CreateUserDto, UpdateUserDto, CreateCustomRoleDto } from './dto/user.dto';
import { AuthenticatedUser } from '../../common/types/authenticated-user.type';

// Zabezpieczenie na poziomie całego kontrolera — domyślnie wyłącznie
// ADMIN. Metody, które mają być dostępne szerzej (me, installers),
// nadpisują to jawnie własnym @Roles (Reflector.getAllAndOverride bierze
// dekorator z metody, jeśli istnieje, zamiast tego z klasy).
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
@Controller('api/users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  // Profil zalogowanego użytkownika — dostępny dla KAŻDEJ roli
  @Roles('ADMIN', 'KIEROWNIK', 'INSTALATOR', 'MAGAZYNIER')
  @Get('me')
  findMe(@CurrentUser() user: AuthenticatedUser) {
    return this.usersService.findOne(user.id);
  }

  // Lekka lista instalatorów (tylko id + imię i nazwisko) — potrzebna
  // przy przypisywaniu do wydarzeń/zadań. Dostępna dla ADMIN i KIEROWNIK,
  // bez pełnych danych kontowych jak w findMany().
  @Roles('ADMIN', 'KIEROWNIK')
  @Get('installers')
  findInstallers() {
    return this.usersService.findInstallers();
  }

  @Get()
  findMany() {
    return this.usersService.findMany();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.usersService.findOne(id);
  }

  @Post()
  create(@Body() dto: CreateUserDto) {
    return this.usersService.create(dto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateUserDto) {
    return this.usersService.update(id, dto);
  }

  @Delete(':id')
  deactivate(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.usersService.deactivate(id, user.id);
  }

  @Get('roles/custom')
  findCustomRoles() {
    return this.usersService.findCustomRoles();
  }

  @Post('roles/custom')
  createCustomRole(@Body() dto: CreateCustomRoleDto) {
    return this.usersService.createCustomRole(dto);
  }
}
