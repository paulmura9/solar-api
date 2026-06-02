import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { asyncHandler } from '../utils/asyncHandler';
import { getDashboardSummary } from '../controllers/dashboard.controller';

const router = Router();

router.use(requireAuth);

router.get('/summary', asyncHandler(getDashboardSummary));

export default router;
