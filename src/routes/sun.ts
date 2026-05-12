import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { asyncHandler } from '../utils/asyncHandler';
import { getSunToday, getSunWeek } from '../controllers/sun.controller';

const router = Router();

router.use(requireAuth);

router.get('/today', asyncHandler(getSunToday));
router.get('/week', asyncHandler(getSunWeek));

export default router;
