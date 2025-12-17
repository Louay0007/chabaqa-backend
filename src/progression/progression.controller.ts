import { Controller, Get, Query, UseGuards, Request } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ProgressionService } from './progression.service';
import { GetProgressionOverviewDto } from './dto/get-progression-overview.dto';
import { ProgressionOverviewDto } from './dto/progression-item.dto';

@ApiTags('Progression')
@Controller('progression')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class ProgressionController {
  constructor(private readonly progressionService: ProgressionService) {}

  @Get('overview')
  @ApiOperation({
    summary: 'Récupérer la progression globale de l’utilisateur',
    description: 'Retourne une vue unifiée des progressions pour tous les contenus communautaires.',
  })
  async getOverview(
    @Request() req: any,
    @Query() query: GetProgressionOverviewDto,
  ): Promise<ProgressionOverviewDto> {
    return this.progressionService.getUserProgressOverview(req.user.userId, query);
  }
}

