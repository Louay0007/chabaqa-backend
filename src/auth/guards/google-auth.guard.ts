import { ExecutionContext, Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class GoogleAuthGuard extends AuthGuard('google') {
  getAuthenticateOptions(context: ExecutionContext) {
    const req = context.switchToHttp().getRequest();
    const rawRedirect = Array.isArray(req?.query?.redirect)
      ? req.query.redirect[0]
      : req?.query?.redirect;

    if (typeof rawRedirect === 'string' && this.isSafeRedirect(rawRedirect)) {
      return { state: rawRedirect };
    }

    return {};
  }

  private isSafeRedirect(path: string): boolean {
    return path.startsWith('/') && !path.startsWith('//');
  }
}

