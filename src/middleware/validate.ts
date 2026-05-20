import { Request, Response, NextFunction, RequestHandler } from 'express';
import type { ZodType } from 'zod';

export function validate<T>(schema: ZodType<T>): RequestHandler {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      res.status(400).json({
        error: 'Validation failed',
        details: result.error.flatten(),
      });
      return;
    }
    req.body = result.data;
    next();
  };
}

export function validateQuery<T>(schema: ZodType<T>): RequestHandler {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.query);
    if (!result.success) {
      res.status(400).json({
        error: 'Invalid query parameters',
        details: result.error.flatten(),
      });
      return;
    }
    // After zod coercion req.query may contain numbers/booleans even though
    // Express types it as ParsedQs (string-only). Assigning through an
    // intermediate works because the destructure at the call sites is loose.
    Object.assign(req.query, result.data as Record<string, unknown>);
    next();
  };
}
