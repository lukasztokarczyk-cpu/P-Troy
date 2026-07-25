import { Controller, Get, Post, Patch, Body, Param, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { FailuresService } from './failures.service';
import { CreateFailureDto, UpdateFailureStatusDto } from './dto/failure.dto';
import { AuthenticatedUser } from '../../common/types/authenticated-user.type';

@UseGuards(JwtAuthGuard)
@Controller('api/failures')
export class FailuresController {
  constructor(private readonly failuresService: FailuresService) {}

  @Get()
  findAll() {
    return this.failuresService.findAll();
  }

  @Post()
  create(@Body() dto: CreateFailureDto, @CurrentUser() user: AuthenticatedUser) {
    return this.failuresService.create(dto, user.id);
  }

  @Patch(':id/status')
  updateStatus(
    @Param('id') id: string,
    @Body() dto: UpdateFailureStatusDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.failuresService.updateStatus(id, dto, user.id, user.role);
  }
}
