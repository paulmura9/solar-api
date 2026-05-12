import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { validateQuery } from '../middleware/validate';
import { asyncHandler } from '../utils/asyncHandler';
import { getEvents } from '../controllers/events.controller';
import { eventsQuerySchema } from '../validators/events.schema';

const router = Router();

router.use(requireAuth);

router.get('/', validateQuery(eventsQuerySchema), asyncHandler(getEvents));
router.get('/recent', validateQuery(eventsQuerySchema), asyncHandler(getEvents));

export default router;
