import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { validateQuery } from '../middleware/validate';
import { withCacheHeaders } from '../middleware/cacheHeaders';
import { cachePolicy } from '../config/cachePolicy';
import { asyncHandler } from '../utils/asyncHandler';
import { getEvents } from '../controllers/events.controller';
import { eventsQuerySchema } from '../validators/events.schema';

const router = Router();

router.use(requireAuth);

router.get('/', withCacheHeaders(cachePolicy.events), validateQuery(eventsQuerySchema), asyncHandler(getEvents));
router.get('/recent', withCacheHeaders(cachePolicy.events), validateQuery(eventsQuerySchema), asyncHandler(getEvents));

export default router;
