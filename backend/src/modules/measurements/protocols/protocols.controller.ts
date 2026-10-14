import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { Request } from 'express';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { ModuleAccessGuard } from '../../../common/guards/module-access.guard';
import { RequiresModule } from '../../../common/decorators/requires-module.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../../../common/types/authenticated-user.type';
import { ProtocolsService } from './protocols.service';
import {
  CalcConfigDto,
  CloseDeadlineDto,
  CreateProtocolDto,
  FieldDefinitionDto,
  ImportBoardDto,
  PrintProtocolDto,
  SectionDefinitionDto,
  SignProtocolDto,
  UpdateFieldDefinitionDto,
  UpdateProtocolDto,
  UpdateSectionDefinitionDto,
  UploadAttachmentDto,
} from './dto/protocol.dto';

/**
 * Moduł „Protokoły” (dawniej „Pomiary”). Klucz modułu w uprawnieniach pozostaje
 * „measurements”, więc istniejące uprawnienia (także per instalator) działają bez zmian.
 * Trasy statyczne (schema, config, definitions, deadlines, site/:siteId...) MUSZĄ być
 * zadeklarowane przed trasami z :id.
 */
@UseGuards(JwtAuthGuard, ModuleAccessGuard)
@RequiresModule('measurements')
@Controller('api/protocols')
export class ProtocolsController {
  constructor(private readonly service: ProtocolsService) {}

  // ---- Trasy statyczne ----

  @Get('schema')
  schema() {
    return this.service.getSchema();
  }

  @Get('config')
  config() {
    return this.service.getCalcConfig();
  }

  @Put('config')
  setConfig(@Body() dto: CalcConfigDto, @CurrentUser() user: AuthenticatedUser) {
    return this.service.setCalcConfig(dto, user);
  }

  @Get('definitions')
  async definitions(@CurrentUser() user: AuthenticatedUser) {
    if (user.role !== 'ADMIN') throw new ForbiddenException('Tylko administrator');
    const d = await this.service.getDefinitions();
    return { sections: d.sectionRows, fields: d.customFields };
  }

  @Post('definitions/sections')
  createSection(@Body() dto: SectionDefinitionDto, @CurrentUser() user: AuthenticatedUser) {
    return this.service.createSectionDefinition(dto, user);
  }

  @Patch('definitions/sections/:id')
  updateSection(@Param('id') id: string, @Body() dto: UpdateSectionDefinitionDto, @CurrentUser() user: AuthenticatedUser) {
    return this.service.updateSectionDefinition(id, dto, user);
  }

  @Delete('definitions/sections/:id')
  deleteSection(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.service.deleteSectionDefinition(id, user);
  }

  @Post('definitions/fields')
  createField(@Body() dto: FieldDefinitionDto, @CurrentUser() user: AuthenticatedUser) {
    return this.service.createFieldDefinition(dto, user);
  }

  @Patch('definitions/fields/:id')
  updateField(@Param('id') id: string, @Body() dto: UpdateFieldDefinitionDto, @CurrentUser() user: AuthenticatedUser) {
    return this.service.updateFieldDefinition(id, dto, user);
  }

  @Delete('definitions/fields/:id')
  deleteField(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.service.deleteFieldDefinition(id, user);
  }

  @Get('performers')
  performers(@CurrentUser() user: AuthenticatedUser) {
    return this.service.listPerformers(user);
  }

  @Get('instruments')
  instruments(@Query('q') q?: string, @Query('all') all?: string) {
    return this.service.listInstruments({ q, all });
  }

  @Get('deadlines')
  deadlines(@CurrentUser() user: AuthenticatedUser, @Query('includeClosed') includeClosed?: string) {
    return this.service.deadlines(user, includeClosed === '1');
  }

  // Ręczne uruchomienie przypomnień (test / nadrobienie po awarii) — tylko administrator
  @Post('reminders/run')
  runReminders(@CurrentUser() user: AuthenticatedUser) {
    if (user.role !== 'ADMIN') throw new ForbiddenException('Tylko administrator');
    return this.service.runReminders();
  }

  @Get('site/:siteId')
  forSite(@Param('siteId') siteId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.service.list(user, { siteId });
  }

  // ---- Lista / tworzenie ----

  @Get()
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query('siteId') siteId?: string,
    @Query('objectType') objectType?: string,
    @Query('status') status?: string,
    @Query('performerId') performerId?: string,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
    @Query('nextFrom') nextFrom?: string,
    @Query('nextTo') nextTo?: string,
    @Query('q') q?: string,
  ) {
    return this.service.list(user, { siteId, objectType, status, performerId, dateFrom, dateTo, nextFrom, nextTo, q });
  }

  @Post()
  create(@Body() dto: CreateProtocolDto, @CurrentUser() user: AuthenticatedUser) {
    return this.service.create(dto, user);
  }

  // ---- Pojedynczy protokół ----

  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.service.findOne(id, user);
  }

  // Autosave woła ten endpoint co ~1,2 s — wyłączony z globalnego limitu żądań.
  @SkipThrottle()
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateProtocolDto, @CurrentUser() user: AuthenticatedUser) {
    return this.service.update(id, dto, user);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.service.remove(id, user);
  }

  @Get(':id/validate')
  validate(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.service.validate(id, user);
  }

  @Post(':id/approve')
  approve(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.service.approve(id, user);
  }

  @Post(':id/deadline')
  deadline(@Param('id') id: string, @Body() dto: CloseDeadlineDto, @CurrentUser() user: AuthenticatedUser) {
    return this.service.setDeadlineClosed(id, dto.closed, user);
  }

  @Post(':id/signatures')
  sign(@Param('id') id: string, @Body() dto: SignProtocolDto, @CurrentUser() user: AuthenticatedUser, @Req() req: Request) {
    const ip = (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress || 'unknown';
    return this.service.sign(id, dto, user, ip, String(req.headers['user-agent'] ?? ''));
  }

  @Delete(':id/signatures/:role')
  removeSignature(@Param('id') id: string, @Param('role') role: string, @CurrentUser() user: AuthenticatedUser) {
    return this.service.removeSignature(id, role === 'REPRESENTATIVE' ? 'REPRESENTATIVE' : 'PERFORMER', user);
  }

  @Post(':id/attachments')
  addAttachment(@Param('id') id: string, @Body() dto: UploadAttachmentDto, @CurrentUser() user: AuthenticatedUser) {
    return this.service.addAttachment(id, dto, user);
  }

  @Delete(':id/attachments/:attId')
  removeAttachment(@Param('id') id: string, @Param('attId') attId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.service.removeAttachment(id, attId, user);
  }

  @Get(':id/boards')
  boards(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.service.listBoards(id, user);
  }

  @Post(':id/import-board')
  importBoard(@Param('id') id: string, @Body() dto: ImportBoardDto, @CurrentUser() user: AuthenticatedUser) {
    return this.service.importBoard(id, dto, user);
  }

  @Post(':id/print')
  print(@Param('id') id: string, @Body() dto: PrintProtocolDto, @CurrentUser() user: AuthenticatedUser) {
    return this.service.print(id, dto, user);
  }

  @Get(':id/print-logs')
  printLogs(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.service.printLogs(id, user);
  }
}
