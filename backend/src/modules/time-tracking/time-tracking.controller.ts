import { Controller, Get, Post, Patch, Body, Param, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { TimeTrackingService } from './time-tracking.service';
import { ClockInDto, CorrectTimeEntryDto, TimeReportFilterDto } from './dto/time-entry.dto';
import { AuthenticatedUser } from '../../common/types/authenticated-user.type';

@UseGuards(JwtAuthGuard)
@Controller('api/time-tracking')
export class TimeTrackingController {
  constructor(private readonly timeTrackingService: TimeTrackingService) {}

  @Get('today')
  findToday(@CurrentUser() user: AuthenticatedUser) {
    return this.timeTrackingService.findToday(user.id);
  }

  @Post('clock-in')
  clockIn(@Body() dto: ClockInDto, @CurrentUser() user: AuthenticatedUser) {
    return this.timeTrackingService.clockIn(user.id, dto);
  }

  @Post('clock-out')
  clockOut(@CurrentUser() user: AuthenticatedUser) {
    return this.timeTrackingService.clockOut(user.id);
  }

  @Get('report')
  report(@Query() filter: TimeReportFilterDto, @CurrentUser() user: AuthenticatedUser) {
    return this.timeTrackingService.report(filter, user.role);
  }

  @Patch(':id/correct')
  correct(
    @Param('id') id: string,
    @Body() dto: CorrectTimeEntryDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.timeTrackingService.correct(id, dto, user.id, user.role);
  }
}
