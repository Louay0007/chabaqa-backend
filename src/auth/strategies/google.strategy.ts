import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy, Profile } from 'passport-google-oauth20';

@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, 'google') {
  constructor() {
    super({
      clientID: process.env.GOOGLE_CLIENT_ID as string,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET as string,
      callbackURL: process.env.GOOGLE_CALLBACK_URL || 'http://localhost:3000/auth/google/callback',
      scope: ['email', 'profile'],
      passReqToCallback: false,
    });
  }

  async validate(
    accessToken: string,
    refreshToken: string,
    profile: Profile,
  ) {
    // Normalize Google profile to a minimal payload the controller/service can use
    const email = profile.emails && profile.emails.length > 0 ? profile.emails[0].value : undefined;
    const name = profile.displayName || (profile.name ? `${profile.name.givenName || ''} ${profile.name.familyName || ''}`.trim() : '');

    return {
      provider: 'google',
      providerId: profile.id,
      email,
      name,
      photo: profile.photos && profile.photos.length > 0 ? profile.photos[0].value : undefined,
      accessToken,
      refreshToken,
    };
  }
}


