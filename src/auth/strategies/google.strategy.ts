import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy, Profile } from 'passport-google-oauth20';

@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, 'google') {
  constructor() {
    const clientID = process.env.GOOGLE_AUTH_CLIENT_ID || process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_AUTH_CLIENT_SECRET || process.env.GOOGLE_CLIENT_SECRET;
    const callbackURL =
      process.env.GOOGLE_AUTH_CALLBACK_URL ||
      process.env.GOOGLE_CALLBACK_URL ||
      'http://localhost:3000/api/auth/google/callback';

    super({
      clientID: clientID as string,
      clientSecret: clientSecret as string,
      callbackURL,
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


