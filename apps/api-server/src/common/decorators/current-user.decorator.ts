import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { AuthPrincipal } from '@fnb/shared';
import type { Request } from 'express';

type AuthenticatedRequest = Request & { user?: AuthPrincipal };

export const CurrentUser = createParamDecorator(
  (field: keyof AuthPrincipal | undefined, context: ExecutionContext): AuthPrincipal | AuthPrincipal[keyof AuthPrincipal] | undefined => {
    const user = context.switchToHttp().getRequest<AuthenticatedRequest>().user;
    return field && user ? user[field] : user;
  },
);
