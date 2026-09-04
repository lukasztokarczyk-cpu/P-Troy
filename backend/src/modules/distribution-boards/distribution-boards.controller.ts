import { Controller, Get, Post, Patch, Delete, Body, Param, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../../common/types/authenticated-user.type';
import { DistributionBoardsService } from './distribution-boards.service';
import {
  CreateDistributionBoardDto, UpdateDistributionBoardDto,
  CreateDistributionBoardDeviceDto, UpdateDistributionBoardDeviceDto,
  CreateSiteRackDto, UpdateSiteRackDto,
  CreateRackDeviceDto, UpdateRackDeviceDto, UpdateRackDevicePortDto,
  CreateSiteFireSafetyItemDto, UpdateSiteFireSafetyItemDto,
} from './dto/distribution-board.dto';

@UseGuards(JwtAuthGuard)
@Controller('api')
export class DistributionBoardsController {
  constructor(private readonly service: DistributionBoardsService) {}

  // ---- Rozdzielnie ----
  @Get('sites/:siteId/distribution-boards')
  findBoards(@Param('siteId') siteId: string) {
    return this.service.findBoards(siteId);
  }

  @Post('sites/:siteId/distribution-boards')
  createBoard(@Param('siteId') siteId: string, @Body() dto: CreateDistributionBoardDto, @CurrentUser() user: AuthenticatedUser) {
    return this.service.createBoard(siteId, dto, user.id);
  }

  @Patch('distribution-boards/:id')
  updateBoard(@Param('id') id: string, @Body() dto: UpdateDistributionBoardDto) {
    return this.service.updateBoard(id, dto);
  }

  @Delete('distribution-boards/:id')
  deleteBoard(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.service.deleteBoard(id, user.role);
  }

  // ---- Aparaty w rozdzielni ----
  @Post('distribution-boards/:boardId/devices')
  createDevice(@Param('boardId') boardId: string, @Body() dto: CreateDistributionBoardDeviceDto) {
    return this.service.createDevice(boardId, dto);
  }

  @Patch('distribution-board-devices/:id')
  updateDevice(@Param('id') id: string, @Body() dto: UpdateDistributionBoardDeviceDto) {
    return this.service.updateDevice(id, dto);
  }

  @Delete('distribution-board-devices/:id')
  deleteDevice(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.service.deleteDevice(id, user.role);
  }

  // ---- Szafy rack/LAN ----
  @Get('sites/:siteId/racks')
  findRacks(@Param('siteId') siteId: string) {
    return this.service.findRacks(siteId);
  }

  @Post('sites/:siteId/racks')
  createRack(@Param('siteId') siteId: string, @Body() dto: CreateSiteRackDto, @CurrentUser() user: AuthenticatedUser) {
    return this.service.createRack(siteId, dto, user.id);
  }

  @Get('racks/:id')
  findRack(@Param('id') id: string) {
    return this.service.findRack(id);
  }

  @Patch('racks/:id')
  updateRack(@Param('id') id: string, @Body() dto: UpdateSiteRackDto) {
    return this.service.updateRack(id, dto);
  }

  @Delete('racks/:id')
  deleteRack(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.service.deleteRack(id, user.role);
  }

  // ---- Urządzenia w szafie rack (pozycje U) ----
  @Post('racks/:rackId/devices')
  createRackDevice(@Param('rackId') rackId: string, @Body() dto: CreateRackDeviceDto) {
    return this.service.createRackDevice(rackId, dto);
  }

  @Patch('rack-devices/:id')
  updateRackDevice(@Param('id') id: string, @Body() dto: UpdateRackDeviceDto, @Query('force') force?: string) {
    return this.service.updateRackDevice(id, dto, force === 'true');
  }

  @Delete('rack-devices/:id')
  deleteRackDevice(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.service.deleteRackDevice(id, user.role);
  }

  // ---- Porty urządzeń (switch/patch panel) ----
  @Patch('rack-device-ports/:id')
  updateRackDevicePort(@Param('id') id: string, @Body() dto: UpdateRackDevicePortDto) {
    return this.service.updateRackDevicePort(id, dto);
  }

  // ---- PPOŻ ----
  @Get('sites/:siteId/fire-safety-items')
  findFireSafetyItems(@Param('siteId') siteId: string) {
    return this.service.findFireSafetyItems(siteId);
  }

  @Post('sites/:siteId/fire-safety-items')
  createFireSafetyItem(@Param('siteId') siteId: string, @Body() dto: CreateSiteFireSafetyItemDto, @CurrentUser() user: AuthenticatedUser) {
    return this.service.createFireSafetyItem(siteId, dto, user.id);
  }

  @Patch('fire-safety-items/:id')
  updateFireSafetyItem(@Param('id') id: string, @Body() dto: UpdateSiteFireSafetyItemDto) {
    return this.service.updateFireSafetyItem(id, dto);
  }

  @Delete('fire-safety-items/:id')
  deleteFireSafetyItem(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.service.deleteFireSafetyItem(id, user.role);
  }
}
