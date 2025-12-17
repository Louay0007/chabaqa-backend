import { Injectable, CanActivate, ExecutionContext, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable } from 'rxjs';

/**
 * Guard pour vérifier si l'utilisateur est un administrateur
 */
@Injectable()
export class AdminGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(
    context: ExecutionContext,
  ): boolean | Promise<boolean> | Observable<boolean> {
    const request = context.switchToHttp().getRequest();
    const user = request.user;

    // Vérifier si l'utilisateur est authentifié
    if (!user) {
      throw new UnauthorizedException('Vous devez être connecté pour effectuer cette action');
    }

    // Vérifier si l'utilisateur est un admin
    const role = user.role || user.type || user.userRole;
    const isAdmin = user.isAdmin || role === 'admin' || role === 'superadmin' || role === 'owner';
    if (!isAdmin) {
      throw new ForbiddenException('Seuls les administrateurs peuvent créer des ressources');
    }

    return true;
  }
} 