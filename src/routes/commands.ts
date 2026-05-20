import { Router, Request } from 'express';
import rateLimit from 'express-rate-limit';
import { requireAuth } from '../middleware/auth';
import { validate, validateQuery } from '../middleware/validate';
import { asyncHandler } from '../utils/asyncHandler';
import { postCommand, getCommands } from '../controllers/commands.controller';
import { createCommandSchema, commandQuerySchema } from '../validators/commands.schema';
import { logger } from '../utils/logger';

const router = Router();

router.use(requireAuth);

const commandLimiter = rateLimit({
  windowMs: 1_000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Command rate limit exceeded. Maximum 10 commands per second.' },
  keyGenerator: (req: Request): string => {
    const userId = req.user?.id;
    if (!userId) {
      logger.warn('commandLimiter', 'Rate limiter falling back to IP key - req.user.id missing');
      return req.ip ?? 'anonymous';
    }
    return userId;
  },
});

router.post('/', commandLimiter, validate(createCommandSchema), asyncHandler(postCommand));
router.get('/', validateQuery(commandQuerySchema), asyncHandler(getCommands));
router.get('/recent', validateQuery(commandQuerySchema), asyncHandler(getCommands));

export default router;
