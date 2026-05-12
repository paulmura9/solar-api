import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { validateQuery } from '../middleware/validate';
import { asyncHandler } from '../utils/asyncHandler';
import { getLatestVision, getVisionHistory } from '../controllers/vision.controller';
import { visionHistoryQuerySchema } from '../validators/vision.schema';

const router = Router();

router.use(requireAuth);

router.get('/latest', asyncHandler(getLatestVision));
router.get('/history', validateQuery(visionHistoryQuerySchema), asyncHandler(getVisionHistory));

export default router;
