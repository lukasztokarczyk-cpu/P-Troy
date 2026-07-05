import { Controller, Get, Post, Patch, Delete, Body, Param, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { VehiclesService } from './vehicles.service';
import {
  CreateVehicleDto,
  UpdateVehicleDto,
  AssignVehicleDto,
  AddEquipmentDto,
  TransferEquipmentDto,
} from './dto/vehicle.dto';
import { AuthenticatedUser } from '../../common/types/authenticated-user.type';

@UseGuards(JwtAuthGuard)
@Controller('api/vehicles')
export class VehiclesController {
  constructor(private readonly vehiclesService: VehiclesService) {}

  @Get()
  findMany() {
    return this.vehiclesService.findMany();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.vehiclesService.findOne(id);
  }

  @Post()
  @UseGuards(RolesGuard)
  @Roles('ADMIN')
  create(@Body() dto: CreateVehicleDto) {
    return this.vehiclesService.create(dto);
  }

  @Patch(':id')
  @UseGuards(RolesGuard)
  @Roles('ADMIN')
  update(@Param('id') id: string, @Body() dto: UpdateVehicleDto) {
    return this.vehiclesService.update(id, dto);
  }

  @Delete(':id')
  @UseGuards(RolesGuard)
  @Roles('ADMIN')
  remove(@Param('id') id: string) {
    return this.vehiclesService.remove(id);
  }

  @Post(':id/assign')
  @UseGuards(RolesGuard)
  @Roles('ADMIN')
  assign(@Param('id') id: string, @Body() dto: AssignVehicleDto) {
    return this.vehiclesService.assign(id, dto);
  }

  @Post(':id/equipment')
  @UseGuards(RolesGuard)
  @Roles('ADMIN')
  addEquipment(@Param('id') id: string, @Body() dto: AddEquipmentDto) {
    return this.vehiclesService.addEquipment(id, dto);
  }

  @Post('equipment/:equipmentId/transfer')
  transferEquipment(
    @Param('equipmentId') equipmentId: string,
    @Body() dto: TransferEquipmentDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.vehiclesService.transferEquipment(equipmentId, dto, user.id);
  }

  // "Wybrać że w danym momencie mają samochód do swojej dyspozycji" —
  // dostępne dla każdej zalogowanej roli, zawsze przypisuje SIEBIE
  // (nie da się w ten sposób przypisać pojazdu innej osobie)
  @Post(':id/claim')
  claimForSelf(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.vehiclesService.claimForSelf(id, user.id);
  }

  // Instalator "oddaje" pojazd — zamyka wyłącznie własne przypisanie
  @Post(':id/release')
  releaseForSelf(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.vehiclesService.releaseForSelf(id, user.id);
  }

  // "Mogą wpisać gdzie byli" — prosty log lokalizacji dostępny dla
  // każdej zalogowanej roli
  @Post(':id/usage-log')
  logUsage(
    @Param('id') id: string,
    @Body('location') location: string,
    @Body('note') note: string | undefined,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.vehiclesService.logUsage(id, user.id, location, note);
  }

  @Get(':id/usage-log')
  findUsageLogs(@Param('id') id: string) {
    return this.vehiclesService.findUsageLogs(id);
  }
}
