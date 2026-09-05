import { Controller, Get, Post, Patch, Delete, Body, Param, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../../common/types/authenticated-user.type';
import { LabelTemplatesService } from './label-templates.service';
import { CreateLabelTemplateDto, UpdateLabelTemplateDto } from './dto/label-template.dto';
import { LabelTargetType } from '@prisma/client';

@UseGuards(JwtAuthGuard)
@Controller('api')
export class LabelTemplatesController {
  constructor(private readonly service: LabelTemplatesService) {}

  @Get('label-templates')
  findTemplates(@Query('targetType') targetType: LabelTargetType) {
    return this.service.findTemplates(targetType);
  }

  @Get('label-templates/fields')
  getAvailableFields(@Query('targetType') targetType: LabelTargetType) {
    return this.service.getAvailableFields(targetType);
  }

  @Post('label-templates')
  createTemplate(@Body() dto: CreateLabelTemplateDto, @CurrentUser() user: AuthenticatedUser) {
    return this.service.createTemplate(dto, user.role, user.id);
  }

  @Patch('label-templates/:id')
  updateTemplate(@Param('id') id: string, @Body() dto: UpdateLabelTemplateDto, @CurrentUser() user: AuthenticatedUser) {
    return this.service.updateTemplate(id, dto, user.role);
  }

  @Post('label-templates/:id/duplicate')
  duplicateTemplate(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.service.duplicateTemplate(id, user.role, user.id);
  }

  @Delete('label-templates/:id')
  deleteTemplate(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.service.deleteTemplate(id, user.role);
  }

  // Rozwiązanie QR (wywoływane przez publiczną-po-zalogowaniu stronę
  // przekierowania /qr/[type]/[id])
  @Get('labels/resolve/:targetType/:recordId')
  resolve(@Param('targetType') targetType: LabelTargetType, @Param('recordId') recordId: string) {
    return this.service.resolveTarget(targetType, recordId);
  }
}
