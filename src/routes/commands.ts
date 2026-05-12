import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { validate, validateQuery } from '../middleware/validate';
import { asyncHandler } from '../utils/asyncHandler';
import { postCommand, getCommands } from '../controllers/commands.controller';
import { createCommandSchema, commandQuerySchema } from '../validators/commands.schema';

const router = Router();

router.use(requireAuth);

router.post('/', validate(createCommandSchema), asyncHandler(postCommand));
router.get('/', validateQuery(commandQuerySchema), asyncHandler(getCommands));
router.get('/recent', validateQuery(commandQuerySchema), asyncHandler(getCommands));

export default router;
