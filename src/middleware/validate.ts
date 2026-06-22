import { Request, Response, NextFunction, RequestHandler } from 'express';
import type { ZodType } from 'zod';

type RequestSource = 'body' | 'query';

function validateRequest<T>(schema: ZodType<T>, source: RequestSource): RequestHandler {
  const errorMessage = source === 'body' ? 'Validation failed' : 'Invalid query parameters';
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req[source]);
    if (!result.success) {
      res.status(400).json({
        error: errorMessage,
        details: result.error.flatten(),
      });
      return;
    }
    if (source === 'body') {
      req.body = result.data;
    } else {
      Object.assign(req.query, result.data as Record<string, unknown>);
    }
    next();
  };
}

export function validate<T>(schema: ZodType<T>): RequestHandler {
  return validateRequest(schema, 'body');
}

export function validateQuery<T>(schema: ZodType<T>): RequestHandler {
  return validateRequest(schema, 'query');
}
