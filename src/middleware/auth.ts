import { Request, Response, NextFunction, RequestHandler } from 'express';
import { isAuthRetryableFetchError } from '@supabase/supabase-js';
import { supabase } from '../config/supabase';
import { logger } from '../utils/logger';

async function requireAuthImpl(req: Request, res: Response, next: NextFunction): Promise<void> {
  const authHeader = req.headers['authorization'];
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Missing or invalid authorization header' });
    return;
  }

  const token = authHeader.slice(7);

  try {
    const { data, error } = await supabase.auth.getUser(token);
    if (error) {
      if (isAuthRetryableFetchError(error)) {
        logger.error('auth', 'Supabase Auth unreachable during token validation', error);
        res.setHeader('Retry-After', '5');
        res.status(503).json({
          error: 'Authentication service temporarily unavailable',
          requestId: req.requestId,
        });
        return;
      }
      res.status(401).json({ error: 'Invalid or expired token' });
      return;
    }
    if (!data.user) {
      res.status(401).json({ error: 'Invalid or expired token' });
      return;
    }
    req.user = data.user;
    next();
  } catch {
    res.status(401).json({ error: 'Token validation failed' });
  }
}

// Wrap the async impl so Express receives a sync (req,res,next)=>void signature.
// Any thrown error from token validation is forwarded to the global error handler.
export const requireAuth: RequestHandler = (req, res, next) => {
  requireAuthImpl(req, res, next).catch(next);
};
