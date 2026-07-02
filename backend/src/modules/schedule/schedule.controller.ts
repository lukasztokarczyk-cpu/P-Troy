import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ScheduleService } from './schedule.service';
import {
  CreateScheduleEventDto,
  UpdateScheduleEventDto,
  MoveScheduleEventDto,
  ScheduleFilterDto,
  AddScheduleCommentDto,
} from './dto/schedule-event.dto';
import { AuthenticatedUser } from '../../common/types/authenticated-user.type';

@UseGuards(JwtAuthGuard)
@Controller('api/schedule')
export class ScheduleController {
  constructor(private readonly scheduleService: ScheduleService) {}

  // Widoki Dzień/Tydzień/Miesiąc/Rok są renderowane na froncie —
  // backend zawsze zwraca płaską listę w podanym zakresie `from`-`to`
  @Get('events')
  findMany(@CurrentUser() user: AuthenticatedUser, @Query() filter: ScheduleFilterDto) {
    return this.scheduleService.findMany(user.id, user.role, filter);
  }

  @Get('events/:id')
  findOne(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.scheduleService.findOne(id, user.id, user.role);
  }

  @Post('events')
  create(@Body() dto: CreateScheduleEventDto, @CurrentUser() user: AuthenticatedUser) {
    return this.scheduleService.create(dto, user.id);
  }

  @Patch('events/:id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateScheduleEventDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.scheduleService.update(id, dto, user.id, user.role);
  }

  // Endpoint dedykowany pod Drag & Drop w kalendarzu
  @Patch('events/:id/move')
  move(
    @Param('id') id: string,
    @Body() dto: MoveScheduleEventDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.scheduleService.move(id, dto, user.id, user.role);
  }

  @Delete('events/:id')
  remove(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.scheduleService.remove(id, user.role);
  }

  @Post('events/:id/comments')
  addComment(
    @Param('id') id: string,
    @Body() dto: AddScheduleCommentDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.scheduleService.addComment(id, dto, user.id);
  }
}
