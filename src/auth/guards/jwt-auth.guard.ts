import { Injectable, ExecutionContext } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  getRequest(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest();
    
    // Pure Bearer token - no cookie fallback
    // The client must send Authorization: Bearer <token> header
    
    return request;
  }
}