import { Controller, Get, Post, Patch, Delete, Body, Param, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AssetsService } from './assets.service';
import {
  CreateAssetCategoryDto,
  CreateAssetStatusDto,
  CreateAssetDto,
  UpdateAssetDto,
  AssignAssetDto,
  ReturnAssetDto,
  TransferAssetDto,
  RespondTransferDto,
  SetAssetStatusDto,
  ReportAssetIssueDto,
} from './dto/asset.dto';
import { AuthenticatedUser } from '../../common/types/authenticated-user.type';

@UseGuards(JwtAuthGuard)
@Controller('api/assets')
export class AssetsController {
  constructor(private readonly assetsService: AssetsService) {}

  // ---- Kategorie — pełne zarządzanie wyłącznie dla administratora ----

  @Get('categories')
  findCategories() {
    return this.assetsService.findCategories();
  }

  @Post('categories')
  @UseGuards(RolesGuard)
  @Roles('ADMIN')
  createCategory(@Body() dto: CreateAssetCategoryDto) {
    return this.assetsService.createCategory(dto);
  }

  @Patch('categories/:id')
  @UseGuards(RolesGuard)
  @Roles('ADMIN')
  updateCategory(@Param('id') id: string, @Body() dto: CreateAssetCategoryDto) {
    return this.assetsService.updateCategory(id, dto);
  }

  @Delete('categories/:id')
  @UseGuards(RolesGuard)
  @Roles('ADMIN')
  removeCategory(@Param('id') id: string) {
    return this.assetsService.removeCategory(id);
  }

  // ---- Statusy — pełne zarządzanie wyłącznie dla administratora ----

  @Get('statuses')
  findStatuses() {
    return this.assetsService.findStatuses();
  }

  @Post('statuses')
  @UseGuards(RolesGuard)
  @Roles('ADMIN')
  createStatus(@Body() dto: CreateAssetStatusDto) {
    return this.assetsService.createStatus(dto);
  }

  @Patch('statuses/:id')
  @UseGuards(RolesGuard)
  @Roles('ADMIN')
  updateStatus(@Param('id') id: string, @Body() dto: CreateAssetStatusDto) {
    return this.assetsService.updateStatus(id, dto);
  }

  @Delete('statuses/:id')
  @UseGuards(RolesGuard)
  @Roles('ADMIN')
  removeStatus(@Param('id') id: string) {
    return this.assetsService.removeStatus(id);
  }

  // ---- Sprzęt ----

  @Get()
  findMany(
    @CurrentUser() user: AuthenticatedUser,
    @Query('search') search?: string,
    @Query('categoryId') categoryId?: string,
    @Query('statusId') statusId?: string,
    @Query('warehouseId') warehouseId?: string,
    @Query('holderUserId') holderUserId?: string,
  ) {
    return this.assetsService.findMany(user.id, user.role, { search, categoryId, statusId, warehouseId, holderUserId });
  }

  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.assetsService.findOne(id, user.role);
  }

  @Post()
  create(@Body() dto: CreateAssetDto, @CurrentUser() user: AuthenticatedUser) {
    return this.assetsService.create(dto, user.id, user.role);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateAssetDto, @CurrentUser() user: AuthenticatedUser) {
    return this.assetsService.update(id, dto, user.role);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.assetsService.remove(id, user.role);
  }

  @Post(':id/assign')
  assign(@Param('id') id: string, @Body() dto: AssignAssetDto, @CurrentUser() user: AuthenticatedUser) {
    return this.assetsService.assign(id, dto, user.id, user.role);
  }

  @Post(':id/return')
  returnToWarehouse(@Param('id') id: string, @Body() dto: ReturnAssetDto, @CurrentUser() user: AuthenticatedUser) {
    return this.assetsService.returnToWarehouse(id, dto, user.id, user.role);
  }

  @Post(':id/transfer')
  createTransfer(@Param('id') id: string, @Body() dto: TransferAssetDto, @CurrentUser() user: AuthenticatedUser) {
    return this.assetsService.createTransfer(id, dto, user.id, user.role);
  }

  @Post('transfers/:transferId/confirm')
  confirmTransfer(@Param('transferId') transferId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.assetsService.confirmTransfer(transferId, user.id);
  }

  @Post('transfers/:transferId/reject')
  rejectTransfer(
    @Param('transferId') transferId: string,
    @Body() dto: RespondTransferDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.assetsService.rejectTransfer(transferId, dto, user.id);
  }

  @Post(':id/issues')
  reportIssue(@Param('id') id: string, @Body() dto: ReportAssetIssueDto, @CurrentUser() user: AuthenticatedUser) {
    return this.assetsService.reportIssue(id, dto, user.id);
  }

  @Patch(':id/status')
  setStatus(@Param('id') id: string, @Body() dto: SetAssetStatusDto, @CurrentUser() user: AuthenticatedUser) {
    return this.assetsService.setStatus(id, dto, user.id, user.role);
  }
}
