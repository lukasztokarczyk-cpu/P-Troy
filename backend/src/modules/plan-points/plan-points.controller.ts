import { Controller, Get, Post, Patch, Delete, Body, Param, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { ModuleAccessGuard } from '../../common/guards/module-access.guard';
import { RequiresModule } from '../../common/decorators/requires-module.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../../common/types/authenticated-user.type';
import { PlanPointsService } from './plan-points.service';
import { CreatePlanPointDto, UpdatePlanPointDto, CreatePlanTypeDto, UpdatePlanTypeDto, UpdateBuiltinTypeDto } from './dto/plan-point.dto';

// Punkty na rzutach należą do modułu "Budowy" (zakładka Dokumentacja).
// Dodawanie, przesuwanie i usuwanie punktów: każda rola z dostępem do budów —
// to roboczy szkic instalacji, a pomyłkę trzeba móc cofnąć na miejscu.
@UseGuards(JwtAuthGuard, ModuleAccessGuard)
@RequiresModule('sites')
@Controller('api')
export class PlanPointsController {
  constructor(private readonly service: PlanPointsService) {}

  // ---- Katalog typów punktów (nazwy w paletach). Odczyt: każdy z dostępem do budów; zmiany: tylko ADMIN ----
  @Get('plan-catalog')
  catalog(@Query('includeArchived') includeArchived?: string) {
    return this.service.getCatalog(includeArchived === '1' || includeArchived === 'true');
  }

  @Post('plan-catalog/types')
  createType(@Body() dto: CreatePlanTypeDto, @CurrentUser() user: AuthenticatedUser) {
    return this.service.createType(dto, user.role, user.id);
  }

  @Patch('plan-catalog/types/:id')
  updateType(@Param('id') id: string, @Body() dto: UpdatePlanTypeDto, @CurrentUser() user: AuthenticatedUser) {
    return this.service.updateType(id, dto, user.role);
  }

  @Delete('plan-catalog/types/:id')
  deleteType(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.service.deleteType(id, user.role);
  }

  @Patch('plan-catalog/builtin/:kind/:key')
  updateBuiltin(@Param('kind') kind: string, @Param('key') key: string, @Body() dto: UpdateBuiltinTypeDto, @CurrentUser() user: AuthenticatedUser) {
    return this.service.updateBuiltinType(kind, key, dto, user.role, user.id);
  }

  @Get('sites/:siteId/plan-points')
  list(@Param('siteId') siteId: string) {
    return this.service.list(siteId);
  }

  @Get('sites/:siteId/plan-circuits')
  circuits(@Param('siteId') siteId: string) {
    return this.service.circuits(siteId);
  }

  @Get('sites/:siteId/plan-points/pdf')
  exportPdf(@Param('siteId') siteId: string) {
    return this.service.exportPdf(siteId);
  }

  @Post('sites/:siteId/plans/:planId/points')
  create(@Param('siteId') siteId: string, @Param('planId') planId: string, @Body() dto: CreatePlanPointDto, @CurrentUser() user: AuthenticatedUser) {
    return this.service.create(siteId, planId, dto, user.id);
  }

  @Patch('plan-points/:id')
  update(@Param('id') id: string, @Body() dto: UpdatePlanPointDto) {
    return this.service.update(id, dto);
  }

  @Delete('plan-points/:id')
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }
}
