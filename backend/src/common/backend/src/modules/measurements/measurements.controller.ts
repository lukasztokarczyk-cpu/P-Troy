import { Controller, Get, Post, Patch, Body, Param, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { MeasurementsService } from './measurements.service';
import { CreateMeasurementDto } from './dto/measurement.dto';
import { AuthenticatedUser } from '../../common/types/authenticated-user.type';

@UseGuards(JwtAuthGuard)
@Controller('api/measurements')
export class MeasurementsController {
  constructor(private readonly measurementsService: MeasurementsService) {}

  @Get('site/:siteId')
  findForSite(@Param('siteId') siteId: string) {
    return this.measurementsService.findForSite(siteId);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.measurementsService.findOne(id);
  }

  @Post()
  create(@Body() dto: CreateMeasurementDto, @CurrentUser() user: AuthenticatedUser) {
    return this.measurementsService.create(dto, user.id);
  }

  // Edycja — dozwolona autorowi pomiaru oraz administratorowi/kierownikowi.
  // Celowo nie ma endpointu DELETE (pomiarów nie można usuwać).
  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: Partial<CreateMeasurementDto>,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.measurementsService.update(id, dto, user.id, user.role);
  }
}
