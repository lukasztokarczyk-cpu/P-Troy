import { Controller, Get, Post, Patch, Body, Param, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../../common/types/authenticated-user.type';
import { PrintJobsService } from './print-jobs.service';
import { CreatePrintJobDto } from './dto/label-template.dto';

@UseGuards(JwtAuthGuard)
@Controller('api/print-jobs')
export class PrintJobsController {
  constructor(private readonly service: PrintJobsService) {}

  @Post()
  create(@Body() dto: CreatePrintJobDto, @CurrentUser() user: AuthenticatedUser) {
    return this.service.create(dto, user.id);
  }

  @Get()
  findMany(@Query('targetType') targetType?: string, @Query('recordId') recordId?: string) {
    return this.service.findMany(targetType, recordId);
  }

  @Get(':id/pdf-url')
  getPdfUrl(@Param('id') id: string) {
    return this.service.getPdfUrl(id);
  }

  @Patch(':id/mark-printed')
  markPrinted(@Param('id') id: string, @Body('status') status: 'PRINTED' | 'FAILED') {
    return this.service.markPrinted(id, status ?? 'PRINTED');
  }
}
