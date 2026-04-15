import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  UseGuards,
  Request,
  BadRequestException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { SSOService } from './sso.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CommunityPermissionGuard } from '../community-access/community-permission.guard';
import { RequireCommunityPermission } from '../community-access/community-permission.decorator';
import { CommunityPermission } from '../common/permissions';

@ApiTags('SSO')
@Controller('sso')
export class SSOController {
  constructor(private readonly ssoService: SSOService) {}

  @Post('saml/:communityId')
  @UseGuards(JwtAuthGuard, CommunityPermissionGuard)
  @RequireCommunityPermission(CommunityPermission.COMMUNITY_MANAGE_SETTINGS)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Configure SAML SSO for community' })
  async configureSAML(
    @Param('communityId') communityId: string,
    @Body()
    config: {
      ssoUrl: string;
      entityId: string;
      certificate: string;
      allowedDomains?: string[];
    },
  ) {
    const ssoConfig = await this.ssoService.createSAMLConfig(communityId, config);
    return { success: true, data: ssoConfig };
  }

  @Post('oidc/:communityId')
  @UseGuards(JwtAuthGuard, CommunityPermissionGuard)
  @RequireCommunityPermission(CommunityPermission.COMMUNITY_MANAGE_SETTINGS)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Configure OIDC SSO for community' })
  async configureOIDC(
    @Param('communityId') communityId: string,
    @Body()
    config: {
      issuer: string;
      clientId: string;
      clientSecret: string;
      scopes?: string[];
      allowedDomains?: string[];
    },
  ) {
    const ssoConfig = await this.ssoService.createOIDCConfig(communityId, config);
    return { success: true, data: ssoConfig };
  }

  @Post(':communityId/activate')
  @UseGuards(JwtAuthGuard, CommunityPermissionGuard)
  @RequireCommunityPermission(CommunityPermission.COMMUNITY_MANAGE_SETTINGS)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Activate SSO for community' })
  async activateSSO(@Param('communityId') communityId: string) {
    const config = await this.ssoService.activateSSO(communityId);
    return { success: true, data: config };
  }

  @Post(':communityId/deactivate')
  @UseGuards(JwtAuthGuard, CommunityPermissionGuard)
  @RequireCommunityPermission(CommunityPermission.COMMUNITY_MANAGE_SETTINGS)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Deactivate SSO for community' })
  async deactivateSSO(@Param('communityId') communityId: string) {
    await this.ssoService.deactivateSSO(communityId);
    return { success: true, message: 'SSO deactivated' };
  }

  @Get(':communityId')
  @UseGuards(JwtAuthGuard, CommunityPermissionGuard)
  @RequireCommunityPermission(CommunityPermission.COMMUNITY_MANAGE_SETTINGS)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get SSO configuration for community' })
  async getSSOConfig(@Param('communityId') communityId: string) {
    const config = await this.ssoService.getSSOConfig(communityId);
    if (!config) {
      throw new BadRequestException('No SSO configuration found');
    }
    // Strip sensitive fields before returning
    const safeConfig = config.toObject() as Record<string, any>;
    delete safeConfig.certificate;
    delete safeConfig.clientSecret;
    return { success: true, data: safeConfig };
  }

  @Get(':communityId/login')
  @ApiOperation({ summary: 'Initiate SSO login flow' })
  async initiateLogin(
    @Param('communityId') communityId: string,
    @Request() req: any,
  ) {
    const redirectUrl = req.query.redirect as string | undefined;
    const config = await this.ssoService.getSSOConfig(communityId);

    if (!config) {
      throw new BadRequestException('SSO not configured');
    }

    let loginUrl: string;
    if (config.provider === 'saml') {
      loginUrl = await this.ssoService.initiateSAMLLogin(communityId, redirectUrl);
    } else {
      // OIDC — build authorization URL
      const scopes = config.scopes?.join(' ') || 'openid profile email';
      const authUrl = new URL(`${config.issuer}/authorize`);
      authUrl.searchParams.set('client_id', config.clientId || '');
      authUrl.searchParams.set(
        'redirect_uri',
        `${process.env.FRONTEND_URL}/sso/callback`,
      );
      authUrl.searchParams.set('response_type', 'code');
      authUrl.searchParams.set('scope', scopes);
      authUrl.searchParams.set('state', communityId);
      loginUrl = authUrl.toString();
    }

    return { success: true, data: { loginUrl } };
  }
}
