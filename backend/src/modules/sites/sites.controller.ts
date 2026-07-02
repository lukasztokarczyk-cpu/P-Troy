import { Controller, Get, Post, Patch, Delete, Body, Param, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { SitesService } from './sites.service';
import { CreateSiteDto, UpdateSiteDto, AddSiteNoteDto, CreateChecklistDto } from './dto/site.dto';
import { AuthenticatedUser } from '../../common/types/authenticated-user.type';

@UseGuards(JwtAuthGuard)
@Controller('api/sites')
export class SitesController {
  constructor(private readonly sitesService: SitesService) {}

  @Get()
  findMany(@CurrentUser() user: AuthenticatedUser) {
    return this.sitesService.findMany(user.id, user.role);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.sitesService.findOne(id);
  }

  @Post()
  create(@Body() dto: CreateSiteDto, @CurrentUser() user: AuthenticatedUser) {
    return this.sitesService.create(dto, user.id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateSiteDto, @CurrentUser() user: AuthenticatedUser) {
    return this.sitesService.update(id, dto, user.role);
  }

  @Patch(':id/archive')
  archive(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.sitesService.archive(id, user.role);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.sitesService.remove(id, user.role);
  }

  // Pracownik samodzielnie dołącza do budowy, do której nie był przypisany
  @Post(':id/join')
  selfJoin(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.sitesService.selfJoin(id, user.id);
  }

  @Post(':id/notes')
  addNote(@Param('id') id: string, @Body() dto: AddSiteNoteDto, @CurrentUser() user: AuthenticatedUser) {
    return this.sitesService.addNote(id, dto, user.id);
  }

  @Post(':id/checklists')
  createChecklist(@Param('id') id: string, @Body() dto: CreateChecklistDto) {
    return this.sitesService.createChecklist(id, dto);
  }

  @Patch('checklist-items/:itemId')
  toggleChecklistItem(@Param('itemId') itemId: string, @Body('isDone') isDone: boolean) {
    return this.sitesService.toggleChecklistItem(itemId, isDone);
  }
}
