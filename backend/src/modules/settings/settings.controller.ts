import { Body, Controller, Get, Param, Patch, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { SettingsService } from './settings.service';

// Dostęp wyłącznie dla administratora ("Ustawienia — dostęp wyłącznie dla administratora")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
@Controller('api/settings')
export class SettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  @Get()
  findAll() {
    return this.settingsService.findAll();
  }

  @Get(':prefix')
  findByPrefix(@Param('prefix') prefix: string) {
    return this.settingsService.findByPrefix(prefix);
  }

  @Patch()
  setMany(@Body() entries: Record<string, string>) {
    return this.settingsService.setMany(entries);
  }
}
