import { Body, Controller, Delete, Get, Param, Post, Put, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { ModuleAccessGuard } from '../../../common/guards/module-access.guard';
import { RequiresModule } from '../../../common/decorators/requires-module.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../../../common/types/authenticated-user.type';
import { SimpleProtocolService } from './simple-protocol.service';
import { CreateSimpleProtocolDto, SimpleListQuery, UpdateSimpleProtocolDto, UploadSimplePhotoDto } from './dto/simple-protocol.dto';

/** Protokół prosty — ten sam klucz modułu („measurements”), więc działają istniejące uprawnienia do Protokołów. */
@UseGuards(JwtAuthGuard, ModuleAccessGuard)
@RequiresModule('measurements')
@Controller('api/simple-protocols')
export class SimpleProtocolController {
  constructor(private readonly service: SimpleProtocolService) {}

  @Get('defaults')
  defaults() {
    return this.service.defaults();
  }

  @Get()
  list(@Query() q: SimpleListQuery, @CurrentUser() user: AuthenticatedUser) {
    return this.service.list(user, q);
  }

  @Post()
  create(@Body() dto: CreateSimpleProtocolDto, @CurrentUser() user: AuthenticatedUser) {
    return this.service.create(dto, user);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.service.findOne(id, user);
  }

  @Put(':id')
  update(@Param('id') id: string, @Body() dto: UpdateSimpleProtocolDto, @CurrentUser() user: AuthenticatedUser) {
    return this.service.update(id, dto, user);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.service.remove(id, user);
  }

  @Post(':id/photos')
  addPhoto(@Param('id') id: string, @Body() dto: UploadSimplePhotoDto, @CurrentUser() user: AuthenticatedUser) {
    return this.service.addPhoto(id, dto, user);
  }

  @Delete(':id/photos/:photoId')
  removePhoto(@Param('id') id: string, @Param('photoId') photoId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.service.removePhoto(id, photoId, user);
  }

  @Post(':id/print')
  print(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.service.print(id, user);
  }
}
