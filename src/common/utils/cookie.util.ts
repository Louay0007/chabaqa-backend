import { Response } from 'express';

export class CookieUtil {
  private static getCookieDomain(): string | undefined {
    if (process.env.NODE_ENV !== 'production') {
      return undefined;
    }

    const candidates = [
      process.env.FRONTEND_URL,
      process.env.NEXT_PUBLIC_APP_URL,
      process.env.SERVER_URL,
    ].filter(Boolean) as string[];

    for (const value of candidates) {
      try {
        const hostname = new URL(value).hostname;
        if (hostname === 'localhost' || /^\d+\.\d+\.\d+\.\d+$/.test(hostname)) {
          continue;
        }

        const parts = hostname.split('.');
        if (parts.length >= 2) {
          return `.${parts.slice(-2).join('.')}`;
        }
      } catch {
        continue;
      }
    }

    return undefined;
  }

  /**
   * Configuration des cookies pour l'access token
   */
  static readonly ACCESS_TOKEN_CONFIG = {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production', // HTTPS en production
    sameSite: process.env.NODE_ENV === 'production' ? 'strict' as const : 'lax' as const,
    maxAge: 2 * 60 * 60 * 1000, // 2 heures (correspond à la durée du JWT)
    path: '/',
    domain: CookieUtil.getCookieDomain(),
  };

  /**
   * Configuration des cookies pour le refresh token
   */
  static readonly REFRESH_TOKEN_CONFIG = {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production', // HTTPS en production
    sameSite: process.env.NODE_ENV === 'production' ? 'strict' as const : 'lax' as const,
    maxAge: 30 * 24 * 60 * 60 * 1000, // 30 jours (correspond à la durée du JWT)
    path: '/',
    domain: CookieUtil.getCookieDomain(),
  };

  /**
   * Noms des cookies
   */
  static readonly COOKIE_NAMES = {
    ACCESS_TOKEN: 'accessToken', // Changed to match frontend naming convention
    REFRESH_TOKEN: 'refreshToken', // Changed to match frontend naming convention
  };

  static readonly ADMIN_COOKIE_NAMES = {
    ACCESS_TOKEN: 'adminAccessToken',
    REFRESH_TOKEN: 'adminRefreshToken',
  };

  /**
   * Définit le cookie d'access token
   */
  static setAccessTokenCookie(res: Response, token: string, rememberMe: boolean = false): void {
    const config = rememberMe ? {
      ...this.ACCESS_TOKEN_CONFIG,
      maxAge: 4 * 60 * 60 * 1000, // 4 heures si "Remember Me"
    } : this.ACCESS_TOKEN_CONFIG;
    
    res.cookie(this.COOKIE_NAMES.ACCESS_TOKEN, token, config);
  }

  /**
   * Définit le cookie de refresh token
   */
  static setRefreshTokenCookie(res: Response, token: string, rememberMe: boolean = false): void {
    const config = rememberMe ? {
      ...this.REFRESH_TOKEN_CONFIG,
      maxAge: 90 * 24 * 60 * 60 * 1000, // 90 jours si "Remember Me"
    } : this.REFRESH_TOKEN_CONFIG;
    
    res.cookie(this.COOKIE_NAMES.REFRESH_TOKEN, token, config);
  }

  /**
   * Définit les deux cookies de tokens
   */
  static setTokenCookies(res: Response, accessToken: string, refreshToken: string, rememberMe: boolean = false): void {
    this.setAccessTokenCookie(res, accessToken, rememberMe);
    this.setRefreshTokenCookie(res, refreshToken, rememberMe);
  }

  static setAdminAccessTokenCookie(res: Response, token: string, rememberMe: boolean = false): void {
    const config = rememberMe ? {
      ...this.ACCESS_TOKEN_CONFIG,
      maxAge: 4 * 60 * 60 * 1000,
    } : this.ACCESS_TOKEN_CONFIG;

    res.cookie(this.ADMIN_COOKIE_NAMES.ACCESS_TOKEN, token, config);
  }

  static setAdminRefreshTokenCookie(res: Response, token: string, rememberMe: boolean = false): void {
    const config = rememberMe ? {
      ...this.REFRESH_TOKEN_CONFIG,
      maxAge: 90 * 24 * 60 * 60 * 1000,
    } : this.REFRESH_TOKEN_CONFIG;

    res.cookie(this.ADMIN_COOKIE_NAMES.REFRESH_TOKEN, token, config);
  }

  static setAdminTokenCookies(res: Response, accessToken: string, refreshToken: string, rememberMe: boolean = false): void {
    this.setAdminAccessTokenCookie(res, accessToken, rememberMe);
    this.setAdminRefreshTokenCookie(res, refreshToken, rememberMe);
  }

  /**
   * Supprime les cookies de tokens (pour la déconnexion)
   */
  static clearTokenCookies(res: Response): void {
    // Clear current cookie names
    res.clearCookie(this.COOKIE_NAMES.ACCESS_TOKEN, {
      path: this.ACCESS_TOKEN_CONFIG.path,
      secure: this.ACCESS_TOKEN_CONFIG.secure,
      sameSite: this.ACCESS_TOKEN_CONFIG.sameSite,
    });
    res.clearCookie(this.COOKIE_NAMES.REFRESH_TOKEN, {
      path: this.REFRESH_TOKEN_CONFIG.path,
      secure: this.REFRESH_TOKEN_CONFIG.secure,
      sameSite: this.REFRESH_TOKEN_CONFIG.sameSite,
    });
    
    // Also clear legacy cookie names for complete cleanup
    res.clearCookie('access_token', {
      path: this.ACCESS_TOKEN_CONFIG.path,
      secure: this.ACCESS_TOKEN_CONFIG.secure,
      sameSite: this.ACCESS_TOKEN_CONFIG.sameSite,
    });
    res.clearCookie('refresh_token', {
      path: this.REFRESH_TOKEN_CONFIG.path,
      secure: this.REFRESH_TOKEN_CONFIG.secure,
      sameSite: this.REFRESH_TOKEN_CONFIG.sameSite,
    });
  }

  static clearAdminTokenCookies(res: Response): void {
    res.clearCookie(this.ADMIN_COOKIE_NAMES.ACCESS_TOKEN, {
      path: this.ACCESS_TOKEN_CONFIG.path,
      secure: this.ACCESS_TOKEN_CONFIG.secure,
      sameSite: this.ACCESS_TOKEN_CONFIG.sameSite,
    });
    res.clearCookie(this.ADMIN_COOKIE_NAMES.REFRESH_TOKEN, {
      path: this.REFRESH_TOKEN_CONFIG.path,
      secure: this.REFRESH_TOKEN_CONFIG.secure,
      sameSite: this.REFRESH_TOKEN_CONFIG.sameSite,
    });
    res.clearCookie('admin_access_token', {
      path: this.ACCESS_TOKEN_CONFIG.path,
      secure: this.ACCESS_TOKEN_CONFIG.secure,
      sameSite: this.ACCESS_TOKEN_CONFIG.sameSite,
    });
    res.clearCookie('admin_refresh_token', {
      path: this.REFRESH_TOKEN_CONFIG.path,
      secure: this.REFRESH_TOKEN_CONFIG.secure,
      sameSite: this.REFRESH_TOKEN_CONFIG.sameSite,
    });
  }
} 
