import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { withCacheHeaders } from '../middleware/cacheHeaders';
import { cachePolicy } from '../config/cachePolicy';
import { asyncHandler } from '../utils/asyncHandler';
import { getLatestCapture } from '../controllers/camera.controller';

const router = Router();

router.use(requireAuth);

router.get('/latest', withCacheHeaders(cachePolicy.cameraLatest), asyncHandler(getLatestCapture));

export default router;
