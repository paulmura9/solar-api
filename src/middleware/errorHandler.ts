import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { HttpError } from '../utils/httpError';
import { logger } from '../utils/logger';
import { env } from '../config/env';

export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof HttpError) {
    if (err.details !== undefined) {
      logger.error('errorHandler', `HttpError ${err.statusCode}: ${err.message}`, err.details);
    }
    res.status(err.statusCode).json({
      error: err.message,
      ...(err.details !== undefined && env.NODE_ENV !== 'production' ? { details: err.details } : {}),
    });
    return;
  }

  if (err instanceof ZodError) {
    res.status(400).json({
      error: 'Validation failed',
      details: err.flatten(),
    });
    return;
  }

  if (err instanceof SyntaxError && 'status' in err && (err as { status: number }).status === 400) {
    res.status(400).json({ error: 'Invalid JSON in request body' });
    return;
  }

  logger.error('errorHandler', 'Unhandled error', err);

  res.status(500).json({
    error: 'Internal server error',
    requestId: req.requestId,
  });
}
