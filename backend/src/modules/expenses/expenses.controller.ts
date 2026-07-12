import { Controller, Get, Post, Body, Param, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ExpensesService } from './expenses.service';
import { CreateExpenseNoteDto } from './dto/expense-note.dto';
import { AuthenticatedUser } from '../../common/types/authenticated-user.type';

@UseGuards(JwtAuthGuard)
@Controller('api/expenses')
export class ExpensesController {
  constructor(private readonly expensesService: ExpensesService) {}

  // Każda zalogowana rola może dodać notatkę o własnym wydatku
  @Post()
  create(@Body() dto: CreateExpenseNoteDto, @CurrentUser() user: AuthenticatedUser) {
    return this.expensesService.create(dto, user.id);
  }

  // Własna historia — dostępna dla każdego
  @Get('mine')
  findMine(@CurrentUser() user: AuthenticatedUser) {
    return this.expensesService.findMine(user.id);
  }

  // Pełna lista wszystkich notatek — wyłącznie administrator
  @Get()
  @UseGuards(RolesGuard)
  @Roles('ADMIN')
  findAll() {
    return this.expensesService.findAll();
  }

  // Historia tankowań konkretnego pojazdu
  @Get('vehicle/:vehicleId')
  findForVehicle(@Param('vehicleId') vehicleId: string) {
    return this.expensesService.findRefuelingsForVehicle(vehicleId);
  }

  /**
   * Tankowania do wyświetlenia w Harmonogramie. Administrator widzi
   * wszystkie (brak parametru userId), instalator dostaje wymuszone
   * własne id niezależnie od tego co przyśle w query — analogicznie
   * do zasady stosowanej w ScheduleService.create.
   */
  @Get('calendar/refuelings')
  findForCalendar(@Query('userId') userId: string | undefined, @CurrentUser() user: AuthenticatedUser) {
    const isPrivileged = user.role === 'ADMIN' || user.role === 'KIEROWNIK';
    return this.expensesService.findRefuelingsForCalendar(isPrivileged ? userId : user.id);
  }
}
