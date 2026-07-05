import { Controller, Get, Post, Patch, Delete, Body, Param, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { WarehouseService } from './warehouse.service';
import {
  CreateWarehouseDto,
  CreateProductDto,
  UpdateProductDto,
  SetStockLevelDto,
  RecordMaterialUsageDto,
} from './dto/warehouse.dto';
import { AuthenticatedUser } from '../../common/types/authenticated-user.type';

@UseGuards(JwtAuthGuard)
@Controller('api/warehouse')
export class WarehouseController {
  constructor(private readonly warehouseService: WarehouseService) {}

  @Get('warehouses')
  findWarehouses() {
    return this.warehouseService.findWarehouses();
  }

  @Post('warehouses')
  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'MAGAZYNIER')
  createWarehouse(@Body() dto: CreateWarehouseDto) {
    return this.warehouseService.createWarehouse(dto);
  }

  @Get('products')
  findProducts(
    @Query('category') category?: string,
    @Query('warehouseId') warehouseId?: string,
    @Query('search') search?: string,
  ) {
    return this.warehouseService.findProducts({ category, warehouseId, search });
  }

  @Get('products/:id')
  findProduct(@Param('id') id: string) {
    return this.warehouseService.findProduct(id);
  }

  @Post('products')
  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'MAGAZYNIER', 'INSTALATOR')
  createProduct(@Body() dto: CreateProductDto) {
    return this.warehouseService.createProduct(dto);
  }

  @Patch('products/:id')
  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'MAGAZYNIER')
  updateProduct(@Param('id') id: string, @Body() dto: UpdateProductDto) {
    return this.warehouseService.updateProduct(id, dto);
  }

  @Delete('products/:id')
  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'MAGAZYNIER')
  removeProduct(@Param('id') id: string) {
    return this.warehouseService.removeProduct(id);
  }

  @Patch('products/:id/stock')
  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'MAGAZYNIER')
  setStockLevel(@Param('id') id: string, @Body() dto: SetStockLevelDto) {
    return this.warehouseService.setStockLevel(id, dto);
  }

  @Post('material-usage')
  recordMaterialUsage(@Body() dto: RecordMaterialUsageDto, @CurrentUser() user: AuthenticatedUser) {
    return this.warehouseService.recordMaterialUsage(dto, user.id);
  }

  @Get('reports/stock')
  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'MAGAZYNIER')
  stockReport(@Query('warehouseId') warehouseId?: string) {
    return this.warehouseService.stockReport(warehouseId);
  }

  @Get('reports/low-stock')
  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'MAGAZYNIER')
  lowStockReport() {
    return this.warehouseService.lowStockReport();
  }
}
