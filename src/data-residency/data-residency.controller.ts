import { Controller, Get, Post, Body, UseGuards, Request } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { DataResidencyService } from './data-residency.service';
import { DataRegion } from '../schema/data-residency.schema';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@ApiTags('Data Residency')
@Controller('user/me/data-residency')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class DataResidencyController {
  constructor(private readonly service: DataResidencyService) {}

  @Get()
  @ApiOperation({ summary: 'Get current data residency settings' })
  async getSettings(@Request() req: any) {
    const userId = req.user._id;
    const settings = await this.service.getUserSettings(userId);
    return {
      success: true,
      data: {
        preferredRegion: settings?.preferredRegion || DataRegion.US,
        migrationStatus: settings?.migrationStatus || null,
        lastMigratedAt: settings?.lastMigratedAt || null,
      },
    };
  }

  @Get('regions')
  @ApiOperation({ summary: 'Get available data regions' })
  async getRegions() {
    const regions = await this.service.getAvailableRegions();
    return { success: true, data: regions };
  }

  @Post()
  @ApiOperation({ summary: 'Set preferred data region' })
  async setRegion(@Request() req: any, @Body() body: { region: string }) {
    const userId = req.user._id;
    await this.service.setUserRegion(userId, body.region as DataRegion);
    return {
      success: true,
      message:
        'Region preference saved. Data migration will begin shortly.',
    };
  }
}
