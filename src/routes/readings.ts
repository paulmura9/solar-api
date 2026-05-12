import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { validateQuery } from '../middleware/validate';
import { asyncHandler } from '../utils/asyncHandler';
import { getLatestReading, getReadingHistory, getReadingStats } from '../controllers/readings.controller';
import { readingHistoryQuerySchema, readingStatsQuerySchema } from '../validators/readings.schema';

const router = Router();

router.use(requireAuth);

router.get('/latest', asyncHandler(getLatestReading));
router.get('/history', validateQuery(readingHistoryQuerySchema), asyncHandler(getReadingHistory));
router.get('/stats', validateQuery(readingStatsQuerySchema), asyncHandler(getReadingStats));

export default router;
