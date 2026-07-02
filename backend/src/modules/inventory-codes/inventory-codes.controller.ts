import { Controller, Get, Post, Body, Param, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { InventoryCodesService } from './inventory-codes.service';
import { GenerateCodeDto, ScanCodeDto } from './dto/inventory-code.dto';
import { AuthenticatedUser } from '../../common/types/authenticated-user.type';

@UseGuards(JwtAuthGuard)
@Controller('api/inventory-codes')
export class InventoryCodesController {
  constructor(private readonly codesService: InventoryCodesService) {}

  @Post()
  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'MAGAZYNIER')
  generate(@Body() dto: GenerateCodeDto, @CurrentUser() user: AuthenticatedUser) {
    return this.codesService.generate(dto, user.id);
  }

  @Post(':id/print-label')
  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'MAGAZYNIER')
  printLabel(@Param('id') id: string) {
    return this.codesService.printLabel(id);
  }

  // Odczyt danych po zeskanowaniu — dostępny dla każdej zalogowanej roli
  @Get('lookup/:value')
  lookup(@Param('value') value: string) {
    return this.codesService.lookup(value);
  }

  @Post('scan')
  scan(@Body() dto: ScanCodeDto, @CurrentUser() user: AuthenticatedUser) {
    return this.codesService.scan(dto, user.id);
  }
}
