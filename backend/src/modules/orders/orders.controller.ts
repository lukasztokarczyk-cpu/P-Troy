import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { ModuleAccessGuard } from '../../common/guards/module-access.guard';
import { RequiresModule } from '../../common/decorators/requires-module.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../../common/types/authenticated-user.type';
import { OrdersService } from './orders.service';
import {
  ChangeStatusDto,
  CommentDto,
  CreateCatalogItemDto,
  CreateCategoryDto,
  CreateOrderDto,
  ListOrdersQuery,
  PrintOrderDto,
  UpdateCatalogItemDto,
  UpdateCategoryDto,
  UpdateOrderDto,
  UploadOrderPhotoDto,
} from './dto/order.dto';

/** Moduł „Zamówienia”. Trasy statyczne (catalog, sites, summary) przed trasami z :id. */
@UseGuards(JwtAuthGuard, ModuleAccessGuard)
@RequiresModule('orders')
@Controller('api/orders')
export class OrdersController {
  constructor(private readonly service: OrdersService) {}

  @Get('summary')
  summary(@CurrentUser() user: AuthenticatedUser) {
    return this.service.summary(user);
  }

  @Get('sites')
  sites(@CurrentUser() user: AuthenticatedUser) {
    return this.service.availableSites(user);
  }

  @Get('catalog')
  catalog(@CurrentUser() user: AuthenticatedUser, @Query('all') all?: string) {
    return this.service.getCatalog(user, all === '1');
  }

  @Post('catalog/categories')
  createCategory(@Body() dto: CreateCategoryDto, @CurrentUser() user: AuthenticatedUser) {
    return this.service.createCategory(dto, user);
  }

  @Patch('catalog/categories/:id')
  updateCategory(@Param('id') id: string, @Body() dto: UpdateCategoryDto, @CurrentUser() user: AuthenticatedUser) {
    return this.service.updateCategory(id, dto, user);
  }

  @Post('catalog/items')
  createItem(@Body() dto: CreateCatalogItemDto, @CurrentUser() user: AuthenticatedUser) {
    return this.service.createCatalogItem(dto, user);
  }

  @Patch('catalog/items/:id')
  updateItem(@Param('id') id: string, @Body() dto: UpdateCatalogItemDto, @CurrentUser() user: AuthenticatedUser) {
    return this.service.updateCatalogItem(id, dto, user);
  }

  @Get()
  list(@Query() q: ListOrdersQuery, @CurrentUser() user: AuthenticatedUser) {
    return this.service.list(user, q);
  }

  @Post()
  create(@Body() dto: CreateOrderDto, @CurrentUser() user: AuthenticatedUser) {
    return this.service.create(dto, user);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.service.findOne(id, user);
  }

  @Put(':id')
  update(@Param('id') id: string, @Body() dto: UpdateOrderDto, @CurrentUser() user: AuthenticatedUser) {
    return this.service.update(id, dto, user);
  }

  @Post(':id/submit')
  submit(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.service.submit(id, user);
  }

  @Post(':id/status')
  status(@Param('id') id: string, @Body() dto: ChangeStatusDto, @CurrentUser() user: AuthenticatedUser) {
    return this.service.changeStatus(id, dto, user);
  }

  @Post(':id/comments')
  comment(@Param('id') id: string, @Body() dto: CommentDto, @CurrentUser() user: AuthenticatedUser) {
    return this.service.addComment(id, dto.message, user);
  }

  @Post(':id/photos')
  addPhoto(@Param('id') id: string, @Body() dto: UploadOrderPhotoDto, @CurrentUser() user: AuthenticatedUser) {
    return this.service.addPhoto(id, dto, user);
  }

  @Delete(':id/photos/:photoId')
  removePhoto(@Param('id') id: string, @Param('photoId') photoId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.service.removePhoto(id, photoId, user);
  }

  @Post(':id/print')
  print(@Param('id') id: string, @Body() dto: PrintOrderDto, @CurrentUser() user: AuthenticatedUser) {
    return this.service.print(id, dto, user);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.service.remove(id, user);
  }
}
