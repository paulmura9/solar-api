import { Router } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { requireAuth } from '../middleware/auth';
import { getHealth, getDeepHealthHandler, getReadyHandler } from '../controllers/health.controller';

const router = Router();

router.get('/', getHealth);
router.get('/deep', requireAuth, asyncHandler(getDeepHealthHandler));
router.get('/ready', requireAuth, asyncHandler(getReadyHandler));

export default router;
