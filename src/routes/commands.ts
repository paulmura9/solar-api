import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { requireAuth } from '../middleware/auth';
import { validate, validateQuery } from '../middleware/validate';
import { asyncHandler } from '../utils/asyncHandler';
import { postCommand, getCommands } from '../controllers/commands.controller';
import { createCommandSchema, commandQuerySchema } from '../validators/commands.schema';

const router = Router();

router.use(requireAuth);

const commandLimiter = rateLimit({
  windowMs: 60_000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Command rate limit exceeded. Maximum 10 commands per minute.' },
});

router.post('/', commandLimiter, validate(createCommandSchema), asyncHandler(postCommand));
router.get('/', validateQuery(commandQuerySchema), asyncHandler(getCommands));
router.get('/recent', validateQuery(commandQuerySchema), asyncHandler(getCommands));

export default router;
