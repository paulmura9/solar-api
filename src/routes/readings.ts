import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { validateQuery } from '../middleware/validate';
import { withCacheHeaders } from '../middleware/cacheHeaders';
import { cachePolicy } from '../config/cachePolicy';
import { asyncHandler } from '../utils/asyncHandler';
import { getLatestReading, getReadingHistory, getReadingStats } from '../controllers/readings.controller';
import { readingHistoryQuerySchema, readingStatsQuerySchema } from '../validators/readings.schema';

const router = Router();

router.use(requireAuth);

router.get('/latest', withCacheHeaders(cachePolicy.readingsLatest), asyncHandler(getLatestReading));
router.get('/history', withCacheHeaders(cachePolicy.readingsHistory), validateQuery(readingHistoryQuerySchema), asyncHandler(getReadingHistory));
// unused — removal candidate
router.get('/stats', validateQuery(readingStatsQuerySchema), asyncHandler(getReadingStats));

export default router;
