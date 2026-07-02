import { Controller, Get, Post, Patch, Delete, Body, Param, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AdminTilesService } from './admin-tiles.service';
import { CreateTileDto, UpdateTileDto, ReorderTilesDto, SetTilePermissionsDto } from './dto/tile.dto';
import { AuthenticatedUser } from '../../common/types/authenticated-user.type';

@UseGuards(JwtAuthGuard)
@Controller('api/tiles')
export class AdminTilesController {
  constructor(private readonly tilesService: AdminTilesService) {}

  @Get('mine')
  findMine(@CurrentUser() user: AuthenticatedUser) {
    return this.tilesService.findVisibleForUser(user.id, user.role, user.customRoleId);
  }

  @Get()
  @UseGuards(RolesGuard)
  @Roles('ADMIN')
  findAll() {
    return this.tilesService.findAll();
  }

  @Post()
  @UseGuards(RolesGuard)
  @Roles('ADMIN')
  create(@Body() dto: CreateTileDto) {
    return this.tilesService.create(dto);
  }

  @Patch(':id')
  @UseGuards(RolesGuard)
  @Roles('ADMIN')
  update(@Param('id') id: string, @Body() dto: UpdateTileDto) {
    return this.tilesService.update(id, dto);
  }

  @Delete(':id')
  @UseGuards(RolesGuard)
  @Roles('ADMIN')
  remove(@Param('id') id: string) {
    return this.tilesService.remove(id);
  }

  @Patch('reorder/apply')
  @UseGuards(RolesGuard)
  @Roles('ADMIN')
  reorder(@Body() dto: ReorderTilesDto) {
    return this.tilesService.reorder(dto);
  }

  @Patch(':id/permissions')
  @UseGuards(RolesGuard)
  @Roles('ADMIN')
  setPermissions(@Param('id') id: string, @Body() dto: SetTilePermissionsDto) {
    return this.tilesService.setPermissions(id, dto);
  }
}
