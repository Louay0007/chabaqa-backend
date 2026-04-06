import { Controller, Get, Post, Patch, Delete, Param, Body, UseGuards, Request, HttpCode, HttpStatus } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { FunnelsService } from './funnels.service';
import { CreateFunnelDto } from './dto/create-funnel.dto';
import { UpdateFunnelDto } from './dto/update-funnel.dto';

@Controller('funnels')
@UseGuards(JwtAuthGuard)
export class FunnelsController {
  constructor(private readonly funnelsService: FunnelsService) {}

  private getUserId(req: any): string {
    return (req?.user?._id || req?.user?.userId || req?.user?.sub || req?.user?.id || '').toString();
  }

  @Get()
  async findAll(@Request() req: any) {
    const creatorId = this.getUserId(req);
    const funnels = await this.funnelsService.findAllByCreator(creatorId);
    return { success: true, data: funnels };
  }

  @Post()
  async create(@Request() req: any, @Body() dto: CreateFunnelDto) {
    const creatorId = this.getUserId(req);
    const funnel = await this.funnelsService.create(creatorId, dto);
    return { success: true, data: funnel, message: 'Funnel created' };
  }

  @Get(':id')
  async findOne(@Request() req: any, @Param('id') id: string) {
    const creatorId = this.getUserId(req);
    const funnel = await this.funnelsService.findOneByCreator(id, creatorId);
    return { success: true, data: funnel };
  }

  @Patch(':id')
  async update(@Request() req: any, @Param('id') id: string, @Body() dto: UpdateFunnelDto) {
    const creatorId = this.getUserId(req);
    const funnel = await this.funnelsService.update(id, creatorId, dto);
    return { success: true, data: funnel, message: 'Funnel updated' };
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  async remove(@Request() req: any, @Param('id') id: string) {
    const creatorId = this.getUserId(req);
    await this.funnelsService.remove(id, creatorId);
    return { success: true, data: null, message: 'Funnel deleted' };
  }

  @Get(':id/analytics')
  async getAnalytics(@Request() req: any, @Param('id') id: string) {
    const creatorId = this.getUserId(req);
    const analytics = await this.funnelsService.getAnalytics(id, creatorId);
    return { success: true, data: analytics };
  }
}
