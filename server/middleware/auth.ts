/**
 * Auth middleware — manages user identity.
 *
 * In production: integrates with SSO/LDAP, sets session cookie.
 * In development: uses X-User-* headers directly or defaults.
 */

import type { Request, Response, NextFunction } from 'express';

export interface UserIdentity {
  userId: string;
  userEmail: string;
  userTeam: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: UserIdentity;
    }
  }
}

export function authMiddleware(req: Request, _res: Response, next: NextFunction): void {
  // In production, this would validate SSO tokens / session cookies.
  // For now, read identity from headers or use defaults.
  req.user = {
    userId: req.headers['x-user-id'] as string || 'anonymous',
    userEmail: req.headers['x-user-email'] as string || '',
    userTeam: req.headers['x-user-team'] as string || '',
  };
  next();
}
