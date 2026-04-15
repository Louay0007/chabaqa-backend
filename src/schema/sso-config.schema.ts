import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export enum SSOProvider {
  SAML = 'saml',
  OIDC = 'oidc',
}

export enum SSOStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
}

@Schema({ timestamps: true, collection: 'sso_configs' })
export class SSOConfig {
  _id: Types.ObjectId;

  @Prop({ required: true, type: String, unique: true })
  communityId: string;

  @Prop({ required: true, type: String, enum: SSOProvider })
  provider: SSOProvider;

  @Prop({ required: true, type: String, enum: SSOStatus, default: SSOStatus.INACTIVE })
  status: SSOStatus;

  // SAML Configuration
  @Prop({ type: String })
  ssoUrl?: string;

  @Prop({ type: String })
  entityId?: string;

  @Prop({ type: String })
  certificate?: string;

  @Prop({ type: String })
  spEntityId?: string;

  // OIDC Configuration
  @Prop({ type: String })
  issuer?: string;

  @Prop({ type: String })
  clientId?: string;

  @Prop({ type: String })
  clientSecret?: string;

  @Prop({ type: [String] })
  scopes?: string[];

  // Advanced
  @Prop({ type: Boolean, default: false })
  forceAuthn?: boolean;

  @Prop({ type: String, enum: ['email', 'username', 'both'] })
  nameIdFormat?: 'email' | 'username' | 'both';

  @Prop({ type: [String], default: [] })
  allowedDomains?: string[];

  @Prop({ type: Date })
  lastVerifiedAt?: Date;
}

export interface SSOConfigDocument extends Document {
  _id: Types.ObjectId;
  communityId: string;
  provider: SSOProvider;
  status: SSOStatus;
  ssoUrl?: string;
  entityId?: string;
  certificate?: string;
  spEntityId?: string;
  issuer?: string;
  clientId?: string;
  clientSecret?: string;
  scopes?: string[];
  forceAuthn?: boolean;
  nameIdFormat?: 'email' | 'username' | 'both';
  allowedDomains?: string[];
  lastVerifiedAt?: Date;
}

export const SSOConfigSchema = SchemaFactory.createForClass(SSOConfig);

SSOConfigSchema.index({ communityId: 1 });
