import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { validateQuery } from '../middleware/validate';
import { withCacheHeaders } from '../middleware/cacheHeaders';
import { cachePolicy } from '../config/cachePolicy';
import { asyncHandler } from '../utils/asyncHandler';
import { getLatestVision, getVisionHistory } from '../controllers/vision.controller';
import { visionHistoryQuerySchema } from '../validators/vision.schema';

const router = Router();

router.use(requireAuth);

router.get('/latest', withCacheHeaders(cachePolicy.visionLatest), asyncHandler(getLatestVision));
router.get('/history', withCacheHeaders(cachePolicy.visionHistory), validateQuery(visionHistoryQuerySchema), asyncHandler(getVisionHistory));

export default router;
