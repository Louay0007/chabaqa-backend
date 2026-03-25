import {
  CanActivate,
  ExecutionContext,
  Injectable,
  ForbiddenException,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PolicyService } from '../services/policy.service';
import { PlanFeatures } from '../../schema/plan.schema';

// ───── Metadata key ─────
export const REQUIRE_FEATURE_KEY = 'requireFeature';

// ───── Decorator ─────
/**
 * Mark a controller method (or class) as requiring one or more plan features.
 *
 * @example
 *   @RequireFeature('challenges')
 *   @RequireFeature('sessions', 'events')
 */
export const RequireFeature = (...features: (keyof PlanFeatures)[]) =>
  SetMetadata(REQUIRE_FEATURE_KEY, features);

// ───── Guard ─────
@Injectable()
export class PlanFeatureGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly policyService: PolicyService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // When enforcement is off, allow everything
    if (process.env.PLAN_ENFORCEMENT_MODE !== 'true') return true;

    const features = this.reflector.getAllAndOverride<(keyof PlanFeatures)[]>(
      REQUIRE_FEATURE_KEY,
      [context.getHandler(), context.getClass()],
    );

    // No features required → allow
    if (!features?.length) return true;

    const req = context.switchToHttp().getRequest();
    const creatorId =
      req.user?.creatorId ||
      req.user?._id ||
      req.user?.userId ||
      req.user?.sub ||
      req.user?.id;

    if (!creatorId) {
      throw new ForbiddenException('Authentication required to access this feature.');
    }

    for (const feature of features) {
      const allowed = await this.policyService.canUseFeature(creatorId, feature);
      if (!allowed) {
        throw new ForbiddenException(
          `Your current plan does not include the "${feature}" feature. Please upgrade your plan to access this.`,
        );
      }
    }

    return true;
  }
}
