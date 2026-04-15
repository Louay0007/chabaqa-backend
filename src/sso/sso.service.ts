import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  SSOConfig,
  SSOConfigDocument,
  SSOProvider,
  SSOStatus,
} from '../schema/sso-config.schema';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class SSOService {
  private readonly logger = new Logger(SSOService.name);

  constructor(
    @InjectModel(SSOConfig.name)
    private ssoConfigModel: Model<SSOConfigDocument>,
  ) {}

  async createSAMLConfig(
    communityId: string,
    config: {
      ssoUrl: string;
      entityId: string;
      certificate: string;
      allowedDomains?: string[];
    },
  ): Promise<SSOConfigDocument> {
    const spEntityId = `chabaqa:${communityId}:${uuidv4()}`;

    const ssoConfig = await this.ssoConfigModel.findOneAndUpdate(
      { communityId },
      {
        communityId,
        provider: SSOProvider.SAML,
        status: SSOStatus.INACTIVE,
        ssoUrl: config.ssoUrl,
        entityId: config.entityId,
        certificate: config.certificate,
        spEntityId,
        allowedDomains: config.allowedDomains || [],
      },
      { upsert: true, new: true },
    );

    return ssoConfig;
  }

  async createOIDCConfig(
    communityId: string,
    config: {
      issuer: string;
      clientId: string;
      clientSecret: string;
      scopes?: string[];
      allowedDomains?: string[];
    },
  ): Promise<SSOConfigDocument> {
    const ssoConfig = await this.ssoConfigModel.findOneAndUpdate(
      { communityId },
      {
        communityId,
        provider: SSOProvider.OIDC,
        status: SSOStatus.INACTIVE,
        issuer: config.issuer,
        clientId: config.clientId,
        clientSecret: config.clientSecret,
        scopes: config.scopes || ['openid', 'profile', 'email'],
        allowedDomains: config.allowedDomains || [],
      },
      { upsert: true, new: true },
    );

    return ssoConfig;
  }

  async activateSSO(communityId: string): Promise<SSOConfigDocument> {
    const config = await this.ssoConfigModel.findOne({ communityId });
    if (!config) {
      throw new BadRequestException('No SSO configuration found');
    }

    config.status = SSOStatus.ACTIVE;
    config.lastVerifiedAt = new Date();
    return config.save();
  }

  async deactivateSSO(communityId: string): Promise<void> {
    await this.ssoConfigModel.updateOne(
      { communityId },
      { status: SSOStatus.INACTIVE },
    );
  }

  async getSSOConfig(communityId: string): Promise<SSOConfigDocument | null> {
    return this.ssoConfigModel.findOne({ communityId });
  }

  async initiateSAMLLogin(
    communityId: string,
    redirectUrl?: string,
  ): Promise<string> {
    const config = await this.getSSOConfig(communityId);
    if (!config || config.status !== SSOStatus.ACTIVE) {
      throw new BadRequestException('SSO not configured or not active');
    }

    const samlRequest = this.buildSAMLRequest(config.spEntityId || '', redirectUrl || '');
    const encodedRequest = Buffer.from(samlRequest).toString('base64');

    const ssoUrl = new URL(config.ssoUrl || '');
    ssoUrl.searchParams.set('SAMLRequest', encodedRequest);

    if (redirectUrl) {
      ssoUrl.searchParams.set('RelayState', redirectUrl);
    }

    return ssoUrl.toString();
  }

  private buildSAMLRequest(
    spEntityId: string,
    assertionConsumerServiceUrl: string,
  ): string {
    return `<?xml version="1.0" encoding="UTF-8"?>
<samlp:AuthnRequest 
  xmlns:samlp="urn:oasis:names:tc:SAML:2.0:protocol" 
  xmlns:saml="urn:oasis:names:tc:SAML:2.0:assertion"
  ID="_${uuidv4()}" 
  Version="2.0" 
  IssueInstant="${new Date().toISOString()}" 
  AssertionConsumerServiceURL="${assertionConsumerServiceUrl}"
  ProtocolBinding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST">
  <saml:Issuer>${spEntityId}</saml:Issuer>
</samlp:AuthnRequest>`;
  }

  async handleSAMLCallback(
    communityId: string,
    samlResponse: string,
  ): Promise<{ userId: string; email: string; name?: string }> {
    const decoded = Buffer.from(samlResponse, 'base64').toString();

    // Extract email from SAML NameID (full implementation would use a SAML library)
    const emailMatch = decoded.match(/<saml:NameID[^>]*>([^<]+)<\/saml:NameID>/);
    const email = emailMatch?.[1] || '';

    this.logger.log(`SAML callback for community ${communityId}, email: ${email}`);

    return {
      userId: uuidv4(),
      email,
      name: email.split('@')[0],
    };
  }
}
